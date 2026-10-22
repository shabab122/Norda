const crypto = require("node:crypto");
const Case = require("../models/ItemReturnCase");
const Order = require("../models/Order");
const OrderRequest = require("../models/OrderRequest");
const Product = require("../models/Product");
const Refund = require("../models/Refund");
const Invoice = require("../models/Invoice");
const CreditNote = require("../models/CreditNote");
const httpError = require("../utils/httpError");
const { withOperationLock } = require("./operationLock");
const { querySession, withDatabaseUnit, insertDocument } = require("./databaseUnit");
const { ownedOrder, objectId, requestKey, noteText, moneyCents, patch, audit } = require("./orderOperationStore");
const { eligibility, requireEligible } = require("./itemReturnPolicy");
const { allocateDiscount } = require("./salesReportService");
const { selection, reserveItem, restoreItem } = require("./inventoryService");
const { refundSource } = require("./verifiedPayments");
const refunds = require("./refundService");
const notify = (order, item, unit) => require("./notificationService").queueOperationMessage(order, item, "item", unit);
const fingerprint = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const safeCase = (c) => ({ _id: c._id, order: c.order, type: c.type, status: c.status, reason: c.reason, items: c.items, creditAmount: c.creditAmount, decisionMessage: c.decisionMessage || "", deadline: c.deadline, refund: c.refund, creditNote: c.creditNote, shipment: c.shipment, createdAt: c.createdAt, decidedAt: c.decidedAt, receivedAt: c.receivedAt });
const usedQuantities = (history) => { const map = new Map(); for (const c of history) if (c.status !== "rejected") for (const i of c.items) map.set(i.lineIndex, (map.get(i.lineIndex) || 0) + i.quantity); return map; };
async function assertNoWholeReturn(order, session) {
  if (order.returnStockRestored || order.stockRestored || await querySession(OrderRequest.findOne({ order: order._id, type: "return", status: { $ne: "rejected" } }), session)) throw httpError(409, "This order already has a whole-order return or restored inventory");
}
function normalizeRequest(body) {
  const key = requestKey(body.requestKey), reason = noteText(body.reason);
  if (!["return", "exchange"].includes(body.type) || !Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw httpError(400, "Select return or exchange and at least one order item");
  const seen = new Set();
  const items = body.items.map((v) => {
    if (!v || !Number.isSafeInteger(v.lineIndex) || v.lineIndex < 0 || !Number.isSafeInteger(v.quantity) || v.quantity < 1 || v.quantity > 999 || seen.has(v.lineIndex)) throw httpError(400, "Use each order line once and a valid whole quantity");
    seen.add(v.lineIndex);
    if (body.type === "exchange") objectId(v.replacementVariantId);
    else if (v.replacementVariantId) throw httpError(400, "Replacement options belong to exchanges");
    return { lineIndex: v.lineIndex, quantity: v.quantity, ...(body.type === "exchange" ? { replacementVariantId: String(v.replacementVariantId) } : {}) };
  }).sort((a, b) => a.lineIndex - b.lineIndex);
  return { key, reason, items, hash: fingerprint({ type: body.type, reason, items }) };
}
async function createCase({ orderId, user, body }) {
  objectId(orderId); const clean = normalizeRequest(body);
  return withOperationLock("order:" + orderId, () => withDatabaseUnit(async (unit) => {
    const order = await ownedOrder(orderId, user, unit.session);
    const replay = await querySession(Case.findOne({ order: orderId, requestKey: clean.key }), unit.session);
    if (replay) { if (replay.requestFingerprint !== clean.hash) throw httpError(409, "This request key belongs to different item details"); return safeCase(replay); }
    const policy = await requireEligible(order, body.type, unit.session);
    await assertNoWholeReturn(order, unit.session);
    const history = await querySession(Case.find({ order: orderId }), unit.session);
    if (history.length >= 50) throw httpError(409, "Please contact customer care for additional requests");
    if (await querySession(Refund.findOne({ order: orderId, scope: "order", status: { $ne: "failed" }, itemCase: { $exists: false } }), unit.session)) throw httpError(409, "A separate refund already exists. Ask the store to reconcile it first.");
    const used = usedQuantities(history), discounts = allocateDiscount(order.items, moneyCents(order.discountAmount));
    const items = [];
    for (const v of clean.items) {
      const line = order.items[v.lineIndex], consumed = used.get(v.lineIndex) || 0;
      if (!line || consumed + v.quantity > line.quantity) throw httpError(409, "The selected quantity was already requested or exceeds the purchased quantity");
      const lineDiscount = discounts[v.lineIndex], net = moneyCents(line.price) * line.quantity - lineDiscount;
      // Stable unit ordinals preserve rounding when an earlier approval is rejected.
      const occupied = new Set(history.filter((c) => c.status !== "rejected").flatMap((c) => c.items.filter((i) => i.lineIndex === v.lineIndex).flatMap((i) => i.unitOrdinals || [])));
      const unitOrdinals = [];
      for (let n = 0; n < line.quantity && unitOrdinals.length < v.quantity; n++) if (!occupied.has(n)) unitOrdinals.push(n);
      if (unitOrdinals.length !== v.quantity) throw httpError(409, "Order unit allocation needs review");
      const floor = Math.floor(net / line.quantity), extra = net % line.quantity;
      const credit = unitOrdinals.reduce((s, n) => s + floor + (n < extra ? 1 : 0), 0);
      const item = { lineIndex: v.lineIndex, unitOrdinals, product: line.product, variantId: line.variantId, name: line.name, sku: line.sku || "", size: line.size || "", color: line.color || "", unitPrice: line.price, quantity: v.quantity, discountAmount: (moneyCents(line.price) * v.quantity - credit) / 100, creditAmount: credit / 100 };
      if (body.type === "exchange") {
        if (!line.variantId || String(line.variantId) === v.replacementVariantId) throw httpError(409, "Choose a different size/color of this product");
        const product = await querySession(Product.findById(line.product), unit.session), replacement = selection(product, v.replacementVariantId);
        if (moneyCents(replacement.price) !== moneyCents(line.price)) throw httpError(409, "Exchanges require the original unit price. Use a return and a new purchase for a price difference.");
        if (replacement.stock < v.quantity) throw httpError(409, "The replacement option has insufficient stock");
        item.replacement = { variantId: replacement.variantId, sku: replacement.sku, size: replacement.size, color: replacement.color, price: replacement.price, image: replacement.image };
      }
      items.push(item);
    }
    const item = await insertDocument(Case, { order: order._id, user: order.user, type: body.type, requestKey: clean.key, requestFingerprint: clean.hash, reason: clean.reason, items, creditAmount: body.type === "return" ? items.reduce((s, i) => s + moneyCents(i.creditAmount), 0) / 100 : 0, status: "requested", replacementReserved: false, deadline: policy.deadline }, unit.session);
    unit.compensate(() => Case.deleteOne({ _id: item._id }));
    await audit(orderId, user, "item_" + body.type + "_requested", clean.reason, unit);
    await notify(order, item, unit);
    return safeCase(item);
  }));
}
const replacementItem = (line) => ({ product: line.product, variantId: line.replacement.variantId, quantity: line.quantity, name: line.name, sku: line.replacement.sku });
async function decideCase({ id, user, body }) {
  objectId(id); const note = noteText(body.note);
  if (!["approve", "reject"].includes(body.decision)) throw httpError(400, "Choose approve or reject");
  const reference = await Case.findById(id); if (!reference) throw httpError(404, "Item request not found");
  return withOperationLock("order:" + reference.order, async () => {
    const item = await Case.findById(id), order = await ownedOrder(item.order, user, null, "payments");
    if (body.decision === "approve" && ["approved", "received", "ready", "shipped", "completed"].includes(item.status)) return safeCase(item);
    if (body.decision === "reject" && item.status === "rejected") return safeCase(item);
    if (!(["requested", "approved"].includes(item.status)) || (body.decision === "approve" && item.status !== "requested")) throw httpError(409, "This request cannot receive that decision");
    await assertNoWholeReturn(order);
    if (body.decision === "approve" && (order.status !== "delivered" || !order.isPaid || order.paymentStatus !== "paid")) throw httpError(409, "Resolve the order payment review before approving this item request");
    const source = body.decision === "approve" && item.type === "return" && item.creditAmount > 0 ? await refundSource(order) : null;
    if (source && source.scope !== "order") throw httpError(409, "The original order payment needs review");
    return withDatabaseUnit(async (unit) => {
      if (body.decision === "approve" && item.type === "exchange") {
        for (const line of item.items) {
          const product = await querySession(Product.findById(line.product), unit.session), option = selection(product, line.replacement.variantId);
          if (moneyCents(option.price) !== moneyCents(line.unitPrice)) throw httpError(409, "Replacement price changed. Reject this request and ask for a new selection.");
          await reserveItem(replacementItem(line), unit);
        }
      }
      if (body.decision === "reject" && item.replacementReserved) for (const line of item.items) await restoreItem(replacementItem(line), unit);
      if (body.decision === "reject" && item.refund) {
        const refund = await querySession(Refund.findById(item.refund), unit.session);
        if (!refund || refund.status !== "awaiting_return") throw httpError(409, "This refund has already been released. Receive and resolve the request instead.");
        await refunds.refundState(refund, { status: "failed", failureReason: "Return approval withdrawn before receipt" }, note, unit, user);
      }
      let updated = await patch(Case, item, { status: body.decision === "approve" ? "approved" : "rejected", decisionMessage: note, decidedBy: user._id, decidedAt: new Date(), replacementReserved: body.decision === "approve" && item.type === "exchange" }, unit);
      if (source) {
        const refund = await refunds.queueRefundInUnit({ order, source, amount: moneyCents(item.creditAmount), key: "item-return-" + item._id, reason: note, actor: user, itemCase: item._id, holdForReturn: true }, unit);
        updated = await patch(Case, updated, { refund: refund._id }, unit);
      }
      await audit(order._id, user, "item_" + item.type + "_" + body.decision, note, unit);
      await notify(order, updated, unit);
      return safeCase(updated);
    });
  });
}
async function receiveCase({ id, user, body }) {
  objectId(id); const note = noteText(body.note);
  if (body.received !== true || !Array.isArray(body.items) || body.items.some((i) => !Number.isSafeInteger(i.lineIndex) || typeof i.restock !== "boolean") || new Set(body.items.map((i) => i.lineIndex)).size !== body.items.length) throw httpError(400, "Confirm receipt and choose a restock decision for each selected line");
  const decisions = [...body.items].map((i) => ({ lineIndex: i.lineIndex, restock: i.restock })).sort((a, b) => a.lineIndex - b.lineIndex), receiptFingerprint = fingerprint(decisions);
  const reference = await Case.findById(id); if (!reference) throw httpError(404, "Item request not found");
  const result = await withOperationLock("order:" + reference.order, () => withDatabaseUnit(async (unit) => {
    const item = await querySession(Case.findById(id), unit.session), order = await ownedOrder(item.order, user, unit.session, "payments");
    if (["received", "ready", "shipped", "completed"].includes(item.status)) { if (item.receiptFingerprint !== receiptFingerprint) throw httpError(409, "This request was already received with different stock decisions"); return item; }
    if (item.status !== "approved") throw httpError(409, "Approve the item request before receiving its items");
    if (decisions.length !== item.items.length || decisions.some((d, index) => d.lineIndex !== item.items[index].lineIndex)) throw httpError(400, "Provide one restock decision for every approved line");
    const items = item.items.map((i, index) => ({ ...(i.toObject?.() || i), restocked: decisions[index].restock }));
    for (const line of items) if (line.restocked) await restoreItem(line, unit);
    let updated = await patch(Case, item, { items, status: item.type === "exchange" ? "ready" : item.creditAmount === 0 ? "completed" : "received", receivedAt: new Date(), receiptFingerprint, decisionMessage: note }, unit);
    if (item.type === "return") {
      const invoice = await querySession(Invoice.findOne({ order: order._id }), unit.session);
      if (!invoice) throw httpError(409, "The original invoice is missing. No return stock or refund was changed.");
      const credit = await insertDocument(CreditNote, { number: "NCN-" + new Date().getUTCFullYear() + "-" + String(item._id).toUpperCase(), itemCase: item._id, order: order._id, invoiceNumber: invoice.invoiceNumber, user: order.user, items: items.map((i) => ({ lineIndex: i.lineIndex, name: i.name, sku: i.sku, quantity: i.quantity, grossAmount: moneyCents(i.unitPrice) * i.quantity / 100, discountAmount: i.discountAmount, creditAmount: i.creditAmount })), totalAmount: item.creditAmount, currency: order.currency, shippingCredit: 0, status: item.creditAmount ? "pending" : "settled", ...(item.refund ? { refund: item.refund } : {}), ...(item.creditAmount ? {} : { settledAt: new Date() }) }, unit.session);
      unit.compensate(() => CreditNote.deleteOne({ _id: credit._id }));
      updated = await patch(Case, updated, { creditNote: credit._id }, unit);
      if (item.creditAmount > 0) {
        const refund = await querySession(Refund.findById(item.refund), unit.session);
        if (!refund || refund.status !== "awaiting_return" || moneyCents(refund.amount) !== moneyCents(item.creditAmount)) throw httpError(409, "The reserved refund is unavailable. Store reconciliation is required.");
        await refunds.refundState(refund, { status: refund.gateway === "manual" ? "pending" : "queued", failureReason: "" }, note, unit, user);
      }
    }
    await audit(order._id, user, "item_" + item.type + "_received", note, unit);
    await notify(order, updated, unit);
    return updated;
  }));
  if (result.refund && result.type === "return") await refunds.processRefund(result.refund, user).catch(() => {});
  return safeCase(await Case.findById(result._id));
}
async function retryCaseRefund({ id, user, body }) {
  objectId(id); const key = requestKey(body.requestKey), note = noteText(body.note);
  const reference = await Case.findById(id); if (!reference) throw httpError(404, "Item request not found");
  const result = await withOperationLock("order:" + reference.order, async () => {
    const item = await Case.findById(id), order = await ownedOrder(item.order, user, null, "payments");
    const replay = await Refund.findOne({ order: order._id, requestKey: key });
    if (replay) { if (String(replay.itemCase) !== String(item._id) || replay.reason !== note || moneyCents(replay.amount) !== moneyCents(item.creditAmount)) throw httpError(409, "This refund key belongs to different request details"); return replay; }
    if (item.type !== "return" || item.status !== "received" || !item.creditNote || !item.refund) throw httpError(409, "Only a received return with a failed refund can be retried");
    const previous = await Refund.findById(item.refund);
    if (!previous || previous.status !== "failed") throw httpError(409, "Resolve the current refund before retrying; pending or unknown refunds must never be submitted twice");
    const source = await refundSource(order);
    return withDatabaseUnit(async (unit) => {
      const refund = await refunds.queueRefundInUnit({ order, source, amount: moneyCents(item.creditAmount), key, reason: note, actor: user, itemCase: item._id }, unit);
      await patch(Case, item, { refund: refund._id }, unit);
      const credit = await querySession(CreditNote.findById(item.creditNote), unit.session);
      if (!credit) throw httpError(409, "The credit note is missing");
      await patch(CreditNote, credit, { refund: refund._id }, unit);
      return refund;
    });
  });
  await refunds.processRefund(result._id, user).catch(() => {});
  return safeCase(await Case.findById(id));
}
async function shipExchange({ id, user, body }) {
  objectId(id); const note = noteText(body.note);
  if (!["shipped", "delivered"].includes(body.status)) throw httpError(400, "Choose shipped or delivered");
  const reference = await Case.findById(id); if (!reference) throw httpError(404, "Exchange not found");
  return withOperationLock("order:" + reference.order, () => withDatabaseUnit(async (unit) => {
    const item = await querySession(Case.findById(id), unit.session), order = await ownedOrder(item.order, user, unit.session, "payments");
    if (item.type !== "exchange") throw httpError(409, "This request is not an exchange");
    if (!order.isPaid || order.paymentStatus !== "paid") throw httpError(409, "Resolve the order payment review before shipping a replacement");
    const shipment = { ...(item.shipment?.toObject?.() || item.shipment || {}) };
    if (body.status === "shipped") {
      const courierName = typeof body.courierName === "string" ? body.courierName.trim() : "", trackingNumber = typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : "";
      if (!courierName || courierName.length > 80 || !trackingNumber || trackingNumber.length > 100 || /[\u0000-\u001f]/.test(courierName + trackingNumber)) throw httpError(400, "Provide courier and tracking number");
      const trackingUrl = require("./shipmentService").normalizeShipment({ requestKey: "exchange-shipment-check", trackingUrl: body.trackingUrl ?? "" }).trackingUrl;
      const hash = fingerprint({ courierName, trackingNumber, trackingUrl });
      if (["shipped", "completed"].includes(item.status)) { if (shipment.dispatchFingerprint !== hash) throw httpError(409, "Replacement was already shipped with different details"); return safeCase(item); }
      if (item.status !== "ready" || !item.replacementReserved) throw httpError(409, "Receive the original items before shipping the reserved replacement");
      Object.assign(shipment, { courierName, trackingNumber, trackingUrl, shippedAt: new Date(), dispatchFingerprint: hash });
    } else {
      if (item.status === "completed") return safeCase(item);
      if (item.status !== "shipped") throw httpError(409, "Ship the replacement before recording delivery");
      shipment.deliveredAt = new Date();
    }
    const updated = await patch(Case, item, { shipment, status: body.status === "delivered" ? "completed" : "shipped" }, unit);
    await audit(order._id, user, "exchange_" + body.status, note, unit);
    await notify(order, updated, unit);
    return safeCase(updated);
  }));
}
async function customerCases(orderId, user) {
  const order = await ownedOrder(orderId, user), policy = await eligibility(order);
  const history = await Case.find({ order: orderId }).sort({ createdAt: -1 }), used = usedQuantities(history);
  const whole = Boolean(await OrderRequest.findOne({ order: orderId, type: "return", status: { $ne: "rejected" } }));
  const items = [];
  for (let index = 0; index < order.items.length; index++) {
    const line = order.items[index], product = line.variantId ? await Product.findById(line.product) : null;
    items.push({ ...(line.toObject?.() || line), lineIndex: index, remainingQuantity: whole ? 0 : Math.max(0, line.quantity - (used.get(index) || 0)), replacements: !product || product.isArchived || !policy.exchangeEnabled ? [] : (product.variants || []).filter((v) => v.isActive !== false && String(v._id) !== String(line.variantId) && v.stock > 0 && moneyCents(require("../utils/validation").effectivePrice(v)) === moneyCents(line.price)).map((v) => ({ _id: v._id, sku: v.sku, size: v.size, color: v.color, stock: v.stock })) });
  }
  return { orderId: order._id, policy: { ...policy, allowed: policy.allowed && !whole }, items, cases: history.map(safeCase), shippingCredit: 0, exchangePolicy: "Equal-price size/color exchanges of the same product. Return shipping is handled by customer care; original delivery fees are not credited." };
}
module.exports = { createCase, decideCase, receiveCase, shipExchange, retryCaseRefund, customerCases, safeCase, usedQuantities, normalizeRequest };

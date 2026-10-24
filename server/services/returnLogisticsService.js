const Pickup = require("../models/ReturnPickup"), Receipt = require("../models/ReturnReceipt"), Case = require("../models/ItemReturnCase");
const error = require("../utils/httpError"), { hash, plain, text } = require("../utils/expansion");
const { objectId, requestKey, noteText, patch, ownedOrder, audit, moneyCents } = require("./orderOperationStore");
const { withOperationLock } = require("./operationLock");
const { withDatabaseUnit, querySession: qs, insertDocument: insert } = require("./databaseUnit");
async function list(orderId, user) { await ownedOrder(orderId, user, null, "orders"); const rows = await Pickup.find({ order: orderId }).sort({ createdAt: -1 }); return rows.map(p => ({ ...plain(p), history: p.history.map(h => ({ status: h.status, note: h.note, at: h.at })) })); }
async function requestPickup(orderId, user, body) {
  objectId(orderId); const key = requestKey(body.requestKey), note = noteText(body.note);
  const field = body.itemCase ? "itemCase" : "orderRequest", id = body[field]; objectId(id);
  const intentHash = hash([field, id, note]);
  return withOperationLock("order:" + orderId, () => withDatabaseUnit(async unit => {
    const order = await ownedOrder(orderId, user, unit.session), existing = await qs(Pickup.findOne({ order: orderId, requestKey: key }), unit.session);
    if (existing) { if (existing.intentHash !== intentHash) throw error(409, "Pickup key belongs to different details"); return existing; }
    const record = await qs(require("../models/" + (field === "itemCase" ? "ItemReturnCase" : "OrderRequest")).findById(id), unit.session);
    if (!record || String(record.order) !== orderId || record.status !== "approved" || (field === "orderRequest" && record.type !== "return")) throw error(409, "A pickup requires an approved return or exchange");
    if (await qs(Pickup.exists({ [field]: id, status: { $nin: ["cancelled", "rejected"] } }), unit.session)) throw error(409, "This request already has an active pickup");
    const row = await insert(Pickup, { order: order._id, user: order.user, [field]: id, requestKey: key, intentHash, address: plain(order.shippingAddress), status: "requested", history: [{ key, hash: intentHash, status: "requested", note, at: new Date(), actor: user._id }] }, unit.session);
    unit.compensate(() => Pickup.deleteOne({ _id: row._id })); await audit(orderId, user, "reverse_pickup_requested", note, unit); return row;
  }));
}
async function updatePickup(id, user, body) {
  objectId(id); if (await require("../models/LogisticsJob").exists({ targetType: "pickup", targetId: id, status: { $nin: ["cancelled", "rejected"] } })) throw error(409, "Use API synchronization for this reverse booking");
  const key = requestKey(body.requestKey), note = noteText(body.note), reference = await Pickup.findById(id); if (!reference) throw error(404, "Pickup not found");
  const fields = { status: body.status };
  if (body.status === "booked") {
    if (body.confirmed !== true) throw error(400, "Confirm that the courier accepted this booking");
    fields.courierName = text(body.courierName, 80); fields.bookingReference = text(body.bookingReference, 100);
    fields.trackingUrl = require("./shipmentService").normalizeShipment({ requestKey: key, trackingUrl: body.trackingUrl || "" }).trackingUrl;
    fields.scheduledFor = new Date(body.scheduledFor); if (!Number.isFinite(+fields.scheduledFor) || +fields.scheduledFor < Date.now() - 86400000) throw error(400, "Provide a valid pickup appointment");
  }
  const fingerprint = hash([fields, note]);
  return withOperationLock("order:" + reference.order, () => withDatabaseUnit(async unit => {
    const row = await qs(Pickup.findById(id), unit.session), order = await ownedOrder(row.order, user, unit.session, "orders"), replay = row.history.find(h => h.key === key);
    if (replay) { if (replay.hash !== fingerprint) throw error(409, "Pickup key belongs to different details"); return row; }
    const allowed = { requested: ["booked", "rejected", "cancelled"], booked: ["picked_up", "cancelled"], picked_up: ["in_transit", "arrived"], in_transit: ["arrived"] };
    if (!allowed[row.status]?.includes(body.status)) throw error(409, "Pickup status cannot make that transition");
    if (body.status === "cancelled" && row.status === "booked" && body.confirmed !== true) throw error(400, "Confirm that the courier cancelled the booking");
    const changed = await patch(Pickup, row, { ...fields, history: [...row.history.map(plain), { key, hash: fingerprint, status: body.status, note, actor: user._id, at: new Date() }] }, unit);
    await audit(order._id, user, "reverse_pickup_" + body.status, note, unit);
    await require("./notificationService").queueMessage(order, "return", "pickup:" + row._id + ":" + body.status, unit, "Return pickup: " + body.status + (fields.bookingReference ? " · " + fields.courierName + " · " + fields.bookingReference : ""));
    return changed;
  }));
}
async function receivePartial({ id, user, body }) {
  objectId(id); const key = requestKey(body.requestKey), note = noteText(body.note);
  if (body.received !== true || !Array.isArray(body.items) || !body.items.length) throw error(400, "Confirm physical receipt and enter at least one received quantity");
  const items = body.items.map(i => {
    if (!Number.isInteger(i.lineIndex) || i.lineIndex < 0 || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || !Number.isSafeInteger(i.restockQuantity) || i.restockQuantity < 0 || i.restockQuantity > i.quantity) throw error(400, "Received/restocked quantities must be whole numbers within the actual receipt");
    const warehouse = String(i.warehouse || "online"); if (warehouse !== "online") objectId(warehouse);
    return { lineIndex: i.lineIndex, quantity: i.quantity, restockQuantity: i.restockQuantity, warehouse };
  }).sort((a, b) => a.lineIndex - b.lineIndex);
  if (new Set(items.map(i => i.lineIndex)).size !== items.length) throw error(400, "Use each received line once");
  const fingerprint = hash([items, note]), reference = await Case.findById(id); if (!reference) throw error(404, "Return request not found");
  const result = await withOperationLock("order:" + reference.order, () => withDatabaseUnit(async unit => {
    const current = await qs(Case.findById(id), unit.session), order = await ownedOrder(current.order, user, unit.session, "payments");
    const replay = await qs(Receipt.findOne({ itemCase: id, requestKey: key }), unit.session);
    if (replay) { if (replay.intentHash !== fingerprint) throw error(409, "Receipt key belongs to different quantities or notes"); return current; }
    if (!["approved", "receiving"].includes(current.status)) throw error(409, "Only approved, incompletely received requests accept another receipt");
    const updatedItems = current.items.map(plain);
    for (const receipt of items) {
      const line = updatedItems.find(i => i.lineIndex === receipt.lineIndex);
      if (!line || (line.receivedQuantity || 0) + receipt.quantity > line.quantity) throw error(409, "Received quantity exceeds the unreceived approved quantity");
      line.receivedQuantity = (line.receivedQuantity || 0) + receipt.quantity; line.restockedQuantity = (line.restockedQuantity || 0) + receipt.restockQuantity; line.restocked = line.restockedQuantity === line.quantity;
      if (receipt.restockQuantity) await require("./warehouseBulkService").restock({ ...line, quantity: receipt.restockQuantity }, receipt.warehouse, unit);
    }
    const receipt = await insert(Receipt, { itemCase: id, order: order._id, requestKey: key, intentHash: fingerprint, items, note, actor: user._id }, unit.session); unit.compensate(() => Receipt.deleteOne({ _id: receipt._id }));
    const complete = updatedItems.every(i => i.receivedQuantity === i.quantity);
    let status = "receiving";
    if (complete) status = current.type === "exchange" ? (moneyCents(current.exchangeBalance) > 0 && current.exchangePaymentStatus !== "paid") || moneyCents(current.exchangeBalance) < 0 ? "received" : "ready" : current.creditAmount ? "received" : "completed";
    let changed = await patch(Case, current, { items: updatedItems, status, decisionMessage: note, ...(complete ? { receivedAt: new Date() } : {}) }, unit);
    if (complete && (current.type === "return" || moneyCents(current.exchangeBalance) < 0)) {
      const invoice = await qs(require("../models/Invoice").findOne({ order: order._id }), unit.session); if (!invoice) throw error(409, "Original invoice is missing; no receipt or stock change was kept");
      const creditItems = current.type === "exchange" ? [{ lineIndex: current.items[0].lineIndex, name: "Exchange price adjustment", quantity: 1, grossAmount: current.creditAmount, discountAmount: 0, creditAmount: current.creditAmount }] : updatedItems.map(i => ({ lineIndex: i.lineIndex, name: i.name, sku: i.sku, quantity: i.quantity, grossAmount: moneyCents(i.unitPrice) * i.quantity / 100, discountAmount: i.discountAmount, creditAmount: i.creditAmount }));
      const Credit = require("../models/CreditNote"), credit = await insert(Credit, { number: "NCN-" + new Date().getUTCFullYear() + "-" + String(current._id).toUpperCase(), kind: current.type === "exchange" ? "exchange_adjustment" : "return", itemCase: id, order: order._id, invoiceNumber: invoice.invoiceNumber, user: order.user, items: creditItems, totalAmount: current.creditAmount, currency: order.currency, shippingCredit: 0, status: current.creditAmount ? "pending" : "settled", ...(current.refund ? { refund: current.refund } : {}), ...(current.creditAmount ? {} : { settledAt: new Date() }) }, unit.session);
      unit.compensate(() => Credit.deleteOne({ _id: credit._id })); changed = await patch(Case, changed, { creditNote: credit._id }, unit);
      if (current.creditAmount > 0) {
        const refund = await qs(require("../models/Refund").findById(current.refund), unit.session);
        if (!refund || refund.status !== "awaiting_return" || moneyCents(refund.amount) !== moneyCents(current.creditAmount)) throw error(409, "The held refund needs reconciliation before receipt");
        await require("./refundService").refundState(refund, { status: refund.gateway === "manual" ? "pending" : "queued", failureReason: "" }, note, unit, user);
      }
    }
    for (const pickup of await qs(Pickup.find({ itemCase: id, status: { $nin: ["cancelled", "rejected", "received"] } }), unit.session)) await patch(Pickup, pickup, { status: complete ? "received" : "partially_received", history: [...pickup.history.map(plain), { key: "receipt-" + receipt._id, hash: fingerprint, status: complete ? "received" : "partially_received", note, at: new Date(), actor: user._id }] }, unit);
    await audit(order._id, user, complete ? "items_receipt_completed" : "items_partially_received", note, unit);
    await require("./notificationService").queueOperationMessage(order, changed, "item", unit); return changed;
  }));
  if (result.refund && result.status === "received") await require("./refundService").processRefund(result.refund, user).catch(() => {});
  return require("./itemReturnService").safeCase(await Case.findById(id));
}
module.exports = { list, requestPickup, updatePickup, receivePartial };

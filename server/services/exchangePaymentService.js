const crypto = require("node:crypto");
const Case = require("../models/ItemReturnCase"), Payment = require("../models/ExchangePayment");
const gateway = require("./sslcommerzService"), error = require("../utils/httpError");
const { minor, plain, text, hash } = require("../utils/expansion");
const { objectId, requestKey, noteText, ownedOrder, patch, audit, moneyCents } = require("./orderOperationStore");
const { withDatabaseUnit, querySession: qs, insertDocument: insert } = require("./databaseUnit");
const { withOperationLock } = require("./operationLock");
const safePayment = p => ({ _id: p._id, gateway: p.gateway, status: p.status, amount: p.amount, currency: p.currency, paidAt: p.paidAt, createdAt: p.createdAt, refund: p.refund, failureReason: p.failureReason || "" });
async function ownedCase(id, user, session) { objectId(id); const item = await qs(Case.findById(id), session); if (!item || item.type !== "exchange") throw error(404, "Exchange not found"); const order = await ownedOrder(item.order, user, session, "payments"); return { item, order }; }
async function details(id, user) {
  const { item, order } = await ownedCase(id, user), payments = await Payment.find({ itemCase: id }).sort({ createdAt: -1 });
  return { item: require("./itemReturnService").safeCase(item), orderId: order._id, currency: order.currency, invoiceNumber: item.exchangeInvoiceNumber, payments: payments.map(safePayment), gatewayEnabled: gateway.isConfigured(), simulationEnabled: require("./demoPaymentService").demoEnabled(), gatewayEnvironment: gateway.isLive() ? "live" : "sandbox" };
}
function eligible(item) { if (!["approved", "receiving", "received"].includes(item.status) || moneyCents(item.exchangeBalance) <= 0 || ["paid", "review", "refund_pending"].includes(item.exchangePaymentStatus)) throw error(409, "This exchange has no payable approved balance"); }
function exactValidation(result, payment, validationId) {
  if (!result || !["string", "number"].includes(typeof result.risk_level) || !/^[01]$/.test(String(result.risk_level))) return false;
  try { return minor(result.amount) === minor(payment.amount) && result.val_id === validationId && typeof result.bank_tran_id === "string" && result.bank_tran_id.trim().length > 0 && result.bank_tran_id.length <= 100; } catch { return false; }
}
async function captureInUnit(payment, item, result, validationId, unit) {
  const checked = gateway.verifyPaymentForOrder(result, payment);
  if (!checked.validStatus || !checked.sameTransaction || !checked.sameAmount || !checked.sameCurrency || !exactValidation(result, payment, validationId)) return { ok: false, reason: "Exchange payment validation did not match" };
  if (["paid", "refunded"].includes(payment.status)) return { ok: true, review: false, itemCase: item._id, orderId: item.order };
  if (payment.status === "review" && payment.validationId === validationId && payment.bankTransactionId === result.bank_tran_id) return { ok: true, review: true, itemCase: item._id, orderId: item.order };
  const other = await qs(Payment.findOne({ itemCase: item._id, status: "paid", _id: { $ne: payment._id } }), unit.session);
  const review = checked.riskLevel !== 0 || Boolean(other) || !["approved", "receiving", "received"].includes(item.status) || !item.replacementReserved;
  const changed = await patch(Payment, payment, { status: review ? "review" : "paid", validationId, bankTransactionId: String(result.bank_tran_id), paidAt: new Date(), failureReason: review ? "Risk, duplicate payment or changed exchange requires administrator review" : "" }, unit);
  if (!other) await patch(Case, item, { exchangePaymentStatus: review ? "review" : "paid", ...(!review && item.status === "received" ? { status: "ready" } : {}) }, unit);
  await audit(item.order, null, review ? "exchange_payment_review" : "exchange_payment_paid", review ? "Validated exchange charge needs review" : "Exchange balance verified by gateway", unit);
  return { ok: true, review, itemCase: item._id, orderId: item.order, payment: changed };
}
async function validate(transactionId, validationId) {
  if (typeof transactionId !== "string" || transactionId.length > 100 || typeof validationId !== "string" || !validationId || validationId.length > 100) return { ok: false };
  const reference = await Payment.findOne({ transactionId, gateway: "sslcommerz" }); if (!reference) return { ok: false };
  return withOperationLock("order:" + reference.order, async () => {
    const result = await gateway.validatePayment(validationId);
    return withDatabaseUnit(async unit => captureInUnit(await qs(Payment.findById(reference._id), unit.session), await qs(Case.findById(reference.itemCase), unit.session), result, validationId, unit));
  });
}
async function fail(transactionId, status) {
  const reference = await Payment.findOne({ transactionId, gateway: "sslcommerz" }); if (!reference) return null;
  return withOperationLock("order:" + reference.order, () => withDatabaseUnit(async unit => {
    const payment = await qs(Payment.findById(reference._id), unit.session);
    if (["paid", "refunded", "review"].includes(payment.status)) return payment;
    return patch(Payment, payment, { status, failureReason: "Gateway reported an incomplete exchange payment" }, unit);
  }));
}
async function start(id, user, body) {
  const key = requestKey(body.requestKey), reference = await ownedCase(id, user);
  return withOperationLock("order:" + reference.order._id, async () => {
    let { item, order } = await ownedCase(id, user);
    const replay = await Payment.findOne({ itemCase: id, requestKey: key });
    if (replay) { if (replay.gateway !== "sslcommerz") throw error(409, "This key belongs to another payment method"); return { payment: safePayment(replay), checkoutUrl: replay.status === "initiated" && replay.checkoutUrl ? gateway.ensureGatewayUrl(replay.checkoutUrl) : null }; }
    eligible(item); if (!gateway.isConfigured()) throw error(503, "Configure the store's SSLCOMMERZ account before paying online");
    if (item.exchangeBalance < 10 || item.exchangeBalance > 500000) throw error(409, "This balance requires a store-recorded payment; the gateway accepts BDT 10–500,000");
    for (const previous of await Payment.find({ itemCase: id, gateway: "sslcommerz", status: { $nin: ["paid", "refunded", "review"] } })) {
      if (previous.status === "initiated" && previous.checkoutUrl) return { payment: safePayment(previous), checkoutUrl: gateway.ensureGatewayUrl(previous.checkoutUrl) };
      const history = await gateway.queryPayment({ transactionId: previous.transactionId });
      if (history.APIConnect !== "DONE" || !Array.isArray(history.element) || Number(history.no_of_trans_found) !== history.element.length || history.element.length > 30) throw error(409, "Previous exchange payment needs gateway reconciliation");
      for (const row of history.element) {
        if (row.tran_id !== previous.transactionId || !["VALID", "VALIDATED", "FAILED", "CANCELLED", "EXPIRED", "UNATTEMPTED", "PENDING"].includes(row.status)) throw error(409, "Previous exchange transaction is unclear");
        if (["VALID", "VALIDATED"].includes(row.status)) {
          const validated = await gateway.validatePayment(row.val_id);
          await withDatabaseUnit(async unit => captureInUnit(await qs(Payment.findById(previous._id), unit.session), await qs(Case.findById(id), unit.session), validated, row.val_id, unit));
          throw error(409, "A previous exchange charge was found; refresh its recorded result before paying again");
        }
        if (row.status === "PENDING") throw error(409, "A previous exchange charge is pending; no second charge was opened");
      }
    }
    const payment = await Payment.create({ itemCase: id, order: order._id, user: order.user, requestKey: key, transactionId: "NEX" + crypto.randomBytes(12).toString("hex").toUpperCase(), amount: item.exchangeBalance, currency: order.currency, gateway: "sslcommerz", status: "initiated" });
    try {
      const invoice = { invoiceNumber: item.exchangeInvoiceNumber || "NEX-" + String(id).toUpperCase() };
      const session = await gateway.createPaymentSession({ order: { ...plain(order), totalAmount: item.exchangeBalance, subtotal: item.exchangeBalance, shippingFee: 0, discountAmount: 0, items: item.items.map(i => ({ name: "Exchange: " + i.name })) }, invoice, user: await require("../models/User").findById(order.user), transactionId: payment.transactionId, callbackKind: "exchange" });
      await Payment.updateOne({ _id: payment._id }, { $set: { checkoutUrl: session.checkoutUrl, sessionKey: session.sessionKey } });
      return { payment: safePayment(payment), checkoutUrl: session.checkoutUrl };
    } catch { await Payment.updateOne({ _id: payment._id, status: "initiated" }, { $set: { status: "failed", failureReason: "Exchange checkout could not be opened; reconcile this attempt before another charge" } }); throw error(502, "Could not open exchange payment. The exchange and original invoice were kept."); }
  });
}
async function record(id, user, body, simulation = false) {
  const key = requestKey(body.requestKey), reference = await ownedCase(id, user), note = simulation ? "Simulated exchange payment; no money transferred" : noteText(body.note);
  if (simulation && !require("./demoPaymentService").demoEnabled()) throw error(404, "Simulation is unavailable");
  const gatewayName = simulation ? "demo" : "manual", receipt = simulation ? "SIMULATED-" + key : text(body.reference, 120);
  return withOperationLock("order:" + reference.order._id, async () => {
    // A failure/cancel callback alone is not evidence that no charge exists.
    if (await Payment.exists({ itemCase: id, requestKey: { $ne: key }, gateway: "sslcommerz", status: { $in: ["failed", "cancelled"] } })) {
      for (const attempt of await Payment.find({ itemCase: id, gateway: "sslcommerz", status: { $in: ["failed", "cancelled"] } })) {
        const history = await gateway.queryPayment({ transactionId: attempt.transactionId });
        if (history.APIConnect !== "DONE" || !Array.isArray(history.element) || Number(history.no_of_trans_found) !== history.element.length || history.element.length > 30) throw error(409, "Reconcile the previous online attempt before recording another payment");
        for (const transaction of history.element) {
          if (transaction.tran_id !== attempt.transactionId || !["VALID", "VALIDATED", "FAILED", "CANCELLED", "EXPIRED", "UNATTEMPTED"].includes(transaction.status)) throw error(409, "A previous online charge may still be pending; no second payment was recorded");
          if (["VALID", "VALIDATED"].includes(transaction.status)) {
            const result = await gateway.validatePayment(transaction.val_id);
            await withDatabaseUnit(async unit => captureInUnit(await qs(Payment.findById(attempt._id), unit.session), await qs(Case.findById(id), unit.session), result, transaction.val_id, unit));
            throw error(409, "A previous online charge was found. Refresh the adjustment before recording another payment");
          }
        }
      }
    }
    return withDatabaseUnit(async unit => {
    const { item, order } = await ownedCase(id, user, unit.session), replay = await qs(Payment.findOne({ itemCase: id, requestKey: key }), unit.session);
    if (!simulation && (body.confirmed !== true || minor(body.amount) !== minor(item.exchangeBalance))) throw error(400, "Confirm actual payment and enter the exact exchange balance");
    const intentHash = hash([gatewayName, item.exchangeBalance, receipt, note]);
    if (replay) { if (replay.gateway !== gatewayName || replay.manualReference !== receipt || replay.intentHash !== intentHash) throw error(409, "This payment key belongs to different receipt details"); return safePayment(replay); }
    eligible(item);
    if (!simulation && await qs(Payment.exists({ gateway: "manual", manualReference: receipt }), unit.session)) throw error(409, "This bank/cash receipt is already recorded against an exchange");
    if (await qs(Payment.exists({ itemCase: id, gateway: "sslcommerz", status: { $in: ["initiated", "review"] } }), unit.session)) throw error(409, "Resolve the existing online attempt before recording another payment");
    const payment = await insert(Payment, { itemCase: id, order: order._id, user: order.user, requestKey: key, intentHash, transactionId: "NEX" + crypto.randomBytes(12).toString("hex").toUpperCase(), amount: item.exchangeBalance, currency: order.currency, gateway: gatewayName, status: "paid", manualReference: receipt, bankTransactionId: gatewayName + ":" + key, paidAt: new Date() }, unit.session);
    unit.compensate(() => Payment.deleteOne({ _id: payment._id }));
    await patch(Case, item, { exchangePaymentStatus: "paid", ...(item.status === "received" ? { status: "ready" } : {}) }, unit); await audit(order._id, user, "exchange_payment_recorded", note, unit); return safePayment(payment);
    });
  });
}
async function resolve(id, user, body) {
  objectId(id); const note = noteText(body.note), reference = await Payment.findById(id); if (!reference) throw error(404, "Exchange payment not found");
  if (!["approve", "refund"].includes(body.decision)) throw error(400, "Choose approval or refund");
  const refund = await withOperationLock("order:" + reference.order, async () => {
    const payment = await Payment.findById(id), { item, order } = await ownedCase(payment.itemCase, user);
    if (payment.refund) {
      const prior = await require("../models/Refund").findById(payment.refund);
      if (!prior) throw error(409, "The recorded exchange refund is missing; reconcile it first");
      if (body.decision === "approve" && prior.status !== "failed") throw error(409, "Resolve the active exchange refund before using this charge for fulfillment");
      if (body.decision === "refund" && (prior.status !== "failed" || prior.requestKey === body.requestKey)) {
        if (prior.requestKey !== body.requestKey || prior.reason !== note) throw error(409, "This charge already has a refund with different details");
        return prior;
      }
    }
    if (!["paid", "review"].includes(payment.status)) throw error(409, "Only a captured exchange charge can be resolved");
    if (payment.gateway === "sslcommerz") {
      const result = await gateway.validatePayment(payment.validationId), check = gateway.verifyPaymentForOrder(result, payment);
      if (!check.validStatus || !check.sameTransaction || !check.sameAmount || !check.sameCurrency || !exactValidation(result, payment, payment.validationId) || result.bank_tran_id !== payment.bankTransactionId) throw error(409, "Gateway charge does not match; no resolution was recorded");
      if (body.decision === "approve" && check.riskLevel && body.acknowledgeRisk !== true) throw error(409, "Explicitly acknowledge the verified payment risk");
    }
    return withDatabaseUnit(async unit => {
      if (body.decision === "approve") {
        if (!["approved", "receiving", "received"].includes(item.status) || !item.replacementReserved || await qs(Payment.exists({ itemCase: item._id, status: "paid", _id: { $ne: id } }), unit.session)) throw error(409, "This charge cannot fund the current exchange");
        await patch(Payment, payment, { status: "paid", failureReason: "" }, unit); await patch(Case, item, { exchangePaymentStatus: "paid", ...(item.status === "received" ? { status: "ready" } : {}) }, unit); await audit(order._id, user, "exchange_charge_approved", note, unit); return null;
      }
      if (["ready", "shipped", "completed"].includes(item.status) && payment.status === "paid") throw error(409, "A funded replacement already entered fulfillment; use the completed exchange history for review");
      const row = await require("./refundService").queueRefundInUnit({ order, source: { gateway: payment.gateway, scope: "extra_payment", amount: payment.amount, validationId: payment.validationId || "", bankTransactionId: payment.bankTransactionId, transactionId: payment.transactionId }, amount: minor(payment.amount), key: requestKey(body.requestKey), reason: note, actor: user, exchangePayment: payment._id }, unit);
      await patch(Payment, payment, { refund: row._id }, unit);
      if (!await qs(Payment.exists({ itemCase: item._id, status: "paid", _id: { $ne: payment._id } }), unit.session)) await patch(Case, item, { exchangePaymentStatus: "refund_pending" }, unit);
      return row;
    });
  });
  if (refund) await require("./refundService").processRefund(refund._id, user).catch(() => {}); return { resolved: true };
}
async function syncRefund(refund, unit) {
  if (!refund.exchangePayment || refund.status !== "succeeded") return;
  const payment = await qs(Payment.findById(refund.exchangePayment), unit.session); if (!payment) throw error(409, "Exchange refund charge is missing");
  await patch(Payment, payment, { status: "refunded" }, unit);
  const other = await qs(Payment.exists({ itemCase: payment.itemCase, status: "paid", _id: { $ne: payment._id } }), unit.session);
  if (!other) { const item = await qs(Case.findById(payment.itemCase), unit.session); await patch(Case, item, { exchangePaymentStatus: "refunded" }, unit); }
}
module.exports = { details, start, record, validate, fail, resolve, syncRefund, captureInUnit };

const crypto = require("node:crypto");
const Order = require("../models/Order");
const Refund = require("../models/Refund");
const OrderRequest = require("../models/OrderRequest");
const gateway = require("./sslcommerzService");
const httpError = require("../utils/httpError");
const { withOperationLock } = require("./operationLock");
const { insertDocument, querySession, withDatabaseUnit } = require("./databaseUnit");
const { objectId, noteText, requestKey, cents, moneyCents, patch, patchOrder, audit, ownedOrder, cancelForOperations } = require("./orderOperationStore");
const { refundSource } = require("./verifiedPayments");
const ACTIVE = ["awaiting_return", "queued", "submitting", "pending", "unknown"];
const refundId = () => "NRF" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(8).toString("hex").toUpperCase();
const sumRefunds = (rows) => rows.reduce((sum, row) => sum + moneyCents(row.amount), 0);
const sourceRefunds = (orderId, source, session) => querySession(Refund.find({ order: orderId, bankTransactionId: source.bankTransactionId, gateway: source.gateway }), session);

const syncRefundSummary = async (order, unit) => {
  const rows = await querySession(Refund.find({ order: order._id }), unit.session);
  const ordinary = rows.filter((row) => row.scope === "order");
  const refunded = sumRefunds(ordinary.filter((row) => row.status === "succeeded"));
  const extra = sumRefunds(rows.filter((row) => row.scope === "extra_payment" && row.status === "succeeded"));
  const pending = sumRefunds(ordinary.filter((row) => ACTIVE.includes(row.status)));
  const status = ordinary.some((row) => row.status === "unknown") ? "unknown" : pending ? "pending" : refunded >= moneyCents(order.totalAmount) ? "refunded" : refunded > 0 ? "partially_refunded" : ordinary.some((row) => row.status === "failed") ? "failed" : "none";
  const fields = { refundedAmount: refunded / 100, extraRefundedAmount: extra / 100, refundPendingAmount: pending / 100, refundStatus: status };
  if (status === "refunded") {
    if (["approved", "received"].includes(order.returnStatus)) fields.returnStatus = "completed";
    if (order.cancellationStatus === "approved") fields.cancellationStatus = "completed";
    const requests = await querySession(OrderRequest.find({ order: order._id, status: { $in: ["approved", "received"] } }), unit.session);
    for (const item of requests) await patch(OrderRequest, item, { status: "completed" }, unit);
  }
  return patchOrder(order, fields, unit);
};
const queueRefundInUnit = async ({ order, source, amount, key, reason, actor, itemCase = null, holdForReturn = false }, unit) => {
  const existing = await querySession(Refund.findOne({ order: order._id, requestKey: key }), unit.session);
  if (existing) {
    if (moneyCents(existing.amount) !== amount || existing.bankTransactionId !== source.bankTransactionId) throw httpError(409, "This refund request key belongs to a different refund");
    return existing;
  }
  const previous = await sourceRefunds(order._id, source, unit.session);
  const reserved = sumRefunds(previous.filter((row) => row.status !== "failed"));
  if (amount <= 0 || amount + reserved > moneyCents(source.amount)) throw httpError(409, "This refund exceeds the unrefunded amount or another refund is still unresolved");
  if (itemCase) {
    const record = await querySession(require("../models/ItemReturnCase").findById(itemCase), unit.session);
    if (!record || record.type !== "return" || String(record.order) !== String(order._id) || moneyCents(record.creditAmount) !== amount || record.status !== (holdForReturn ? "approved" : "received") || source.scope !== "order") throw httpError(409, "Invalid item refund reservation");
  } else if (holdForReturn) throw httpError(409, "A return hold requires an approved item request");
  if (!itemCase && source.scope === "order" && order.status !== "cancelled" && !["received", "completed"].includes(order.returnStatus)) throw httpError(409, "Approve cancellation or receive the returned items before refunding this order");
  const refund = await insertDocument(Refund, {
    order: order._id, user: order.user, payment: source.payment?._id, gateway: source.gateway, scope: source.scope,
    requestKey: key, transactionId: refundId(), originalTransactionId: source.payment?.transactionId || "",
    validationId: source.validationId, bankTransactionId: source.bankTransactionId,
    amount: amount / 100, currency: order.currency, ...(itemCase ? { itemCase } : {}), status: holdForReturn ? "awaiting_return" : source.gateway === "manual" ? "pending" : "queued",
    reason, requestedBy: actor._id,
  }, unit.session);
  unit.compensate(() => Refund.deleteOne({ _id: refund._id }));
  await audit(order._id, actor, "refund_requested", reason, unit, { refund: refund._id, payment: source.payment?._id });
  await syncRefundSummary(order, unit);
  await require("./notificationService").queueOperationMessage(order, refund, "refund", unit);
  return refund;
};
const requestRefund = async ({ orderId, user, body }) => {
  objectId(orderId); const key = requestKey(body.requestKey), reason = noteText(body.note);
  const result = await withOperationLock("order:" + orderId, async () => {
    let order = await ownedOrder(orderId, user, null, "payments");
    const replay = await Refund.findOne({ order: orderId, requestKey: key });
    if (replay) {
      if ((body.amount !== undefined && cents(body.amount) !== moneyCents(replay.amount)) || (body.paymentId && String(body.paymentId) !== String(replay.payment)) || (body.validationId !== undefined && body.validationId !== replay.validationId) || reason !== replay.reason) throw httpError(409, "This request key belongs to another refund");
      return replay;
    }
    const source = await refundSource(order, body.paymentId, body.validationId);
    const prior = await sourceRefunds(orderId, source);
    const remaining = moneyCents(source.amount) - sumRefunds(prior.filter((row) => row.status !== "failed"));
    const amount = body.amount === undefined ? remaining : cents(body.amount);
    return withDatabaseUnit(async (unit) => {
      order = await querySession(Order.findById(orderId), unit.session);
      if (source.scope === "order" && order.paymentStatus === "review" && ["pending", "processing"].includes(order.status)) order = await cancelForOperations(order, "Payment review: refund requested", unit);
      return queueRefundInUnit({ order, source, amount, key, reason, actor: user }, unit);
    });
  });
  await processRefund(result._id).catch(() => {});
  return Refund.findById(result._id);
};
const refundState = async (refund, fields, note, unit, actor = null) => {
  const updated = await patch(Refund, refund, fields, unit);
  const order = await querySession(Order.findById(refund.order), unit.session);
  if (!order) throw httpError(409, "Refund order is missing");
  await syncRefundSummary(order, unit);
  if (fields.status && fields.status !== refund.status) await audit(order._id, actor, "refund_" + fields.status, note, unit, { refund: refund._id, payment: refund.payment });
  if (fields.status && fields.status !== refund.status) {
    await require("./itemReturnStore").syncCaseRefund(updated, unit);
    await require("./notificationService").queueOperationMessage(order, updated, "refund", unit);
  }
  return updated;
};
const responseMatches = (data, refund, requireReference = true) => data && data.APIConnect === "DONE" && data.bank_tran_id === refund.bankTransactionId &&
  (data.tran_id || data.trans_id) === refund.originalTransactionId && (!requireReference || data.refund_ref_id === refund.refundReference) &&
  (data.refund_amount === undefined || moneyCents(data.refund_amount) === moneyCents(refund.amount)) && (data.currency === undefined || data.currency === refund.currency);
const queryAndRecordInLock = async (refund, actor) => {
  if (refund.status === "succeeded") return refund;
  let data;
  try { data = await gateway.queryRefund(refund.refundReference); }
  catch { return withDatabaseUnit((unit) => refundState(refund, { lastCheckedAt: new Date(), failureReason: "Provider status is unavailable; no second refund was submitted." }, "Refund query unavailable", unit, actor)); }
  if (!responseMatches(data, refund) || !["refunded", "processing", "cancelled"].includes(data.status)) return withDatabaseUnit((unit) => refundState(refund, { status: "unknown", lastCheckedAt: new Date(), failureReason: "Provider refund details did not match; store reconciliation is required." }, "Refund response needs reconciliation", unit, actor));
  return withDatabaseUnit((unit) => refundState(refund, {
    status: data.status === "refunded" ? "succeeded" : data.status === "cancelled" ? "failed" : "pending",
    lastCheckedAt: new Date(), failureReason: data.status === "cancelled" ? "The provider cancelled this refund; no completion was confirmed." : "",
    ...(data.status === "refunded" ? { completedAt: new Date() } : {}),
  }, "Gateway refund status verified: " + data.status, unit, actor));
};
const processRefund = async (id, actor = null) => {
  objectId(id); const reference = await Refund.findById(id);
  if (!reference) throw httpError(404, "Refund not found");
  return withOperationLock("order:" + reference.order, async () => {
    let refund = await Refund.findById(id);
    if (["succeeded", "failed"].includes(refund.status) || refund.gateway === "manual") return refund;
    if (refund.refundReference) return queryAndRecordInLock(refund, actor);
    if (refund.status === "submitting") {
      if (Date.now() - new Date(refund.submittedAt || refund.updatedAt).getTime() < 60000) return refund;
      return withDatabaseUnit((unit) => refundState(refund, { status: "unknown", failureReason: "Submission was interrupted. Reconcile the existing provider refund; do not submit another one." }, "Interrupted refund submission", unit, actor));
    }
    if (refund.status !== "queued") return refund;
    if (refund.gateway === "demo") return withDatabaseUnit((unit) => refundState(refund, { status: "succeeded", completedAt: new Date(), manualReference: "SIMULATED-" + refund.transactionId }, "Simulated refund completed; no real money was transferred.", unit, actor));
    if (!gateway.isConfigured()) return refund;
    // Commit submitting before crossing the network. A process crash or timeout
    // then requires reconciliation; the worker must never blindly submit twice.
    refund = await withDatabaseUnit((unit) => refundState(refund, { status: "submitting", submittedAt: new Date() }, "Refund submitted to gateway", unit, actor));
    let data;
    try { data = await gateway.initiateRefund(refund); }
    catch { return withDatabaseUnit((unit) => refundState(refund, { status: "unknown", failureReason: "Submission result is unknown. Recover its reference from the merchant portal before retrying." }, "Refund submission result unknown", unit, actor)); }
    if (["INVALID_REQUEST", "FAILED", "INACTIVE"].includes(data?.APIConnect) || (data?.APIConnect === "DONE" && data.status === "failed")) return withDatabaseUnit((unit) => refundState(refund, { status: "failed", failureReason: "The gateway rejected this refund request." }, "Gateway refund initiation rejected", unit, actor));
    const validReference = typeof data?.refund_ref_id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(data.refund_ref_id);
    if (!responseMatches(data, refund, false) || !["success", "processing"].includes(data.status) || !validReference) return withDatabaseUnit((unit) => refundState(refund, { status: "unknown", failureReason: "The gateway did not return matching refund details. Reconciliation is required." }, "Unclear refund initiation response", unit, actor));
    return withDatabaseUnit((unit) => refundState(refund, { status: "pending", refundReference: data.refund_ref_id, failureReason: "" }, "Provider accepted the refund; awaiting confirmation", unit, actor));
  });
};
const confirmManualRefund = async ({ refundId: id, user, body }) => {
  objectId(id); const note = noteText(body.note), manualReference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (body.confirmed !== true || manualReference.length < 3 || manualReference.length > 120) throw httpError(400, "Confirm the money was returned and provide its payment receipt/reference");
  const reference = await Refund.findById(id); if (!reference) throw httpError(404, "Refund not found");
  return withOperationLock("order:" + reference.order, () => withDatabaseUnit(async (unit) => {
    const refund = await querySession(Refund.findById(id), unit.session);
    if (refund.gateway !== "manual") throw httpError(409, "Real gateway refunds must be confirmed by the provider");
    if (refund.status === "succeeded") { if (refund.manualReference !== manualReference) throw httpError(409, "This refund was already recorded with another reference"); return refund; }
    if (refund.status !== "pending") throw httpError(409, "This cash refund cannot be confirmed in its current state");
    return refundState(refund, { status: "succeeded", manualReference, completedAt: new Date(), failureReason: "" }, note, unit, user);
  }));
};
const reconcileRefund = async ({ refundId: id, user, body = {} }) => {
  objectId(id); const reference = await Refund.findById(id); if (!reference) throw httpError(404, "Refund not found");
  return withOperationLock("order:" + reference.order, async () => {
    let refund = await Refund.findById(id);
    if (refund.gateway !== "sslcommerz") throw httpError(409, "This refund does not use the external gateway");
    if (refund.status === "succeeded") return refund;
    if (!refund.refundReference) {
      const note = noteText(body.note);
      if (!["unknown", "submitting"].includes(refund.status) || typeof body.refundReference !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.refundReference) || body.amountVerified !== true || cents(body.confirmedAmount) !== moneyCents(refund.amount)) throw httpError(400, "Provide the existing merchant refund reference and confirm its exact amount from the merchant portal");
      const data = await gateway.queryRefund(body.refundReference);
      if (!responseMatches(data, { ...refund.toObject(), refundReference: body.refundReference }) || !["refunded", "processing", "cancelled"].includes(data.status)) throw httpError(409, "The recovered refund reference did not match this original transaction");
      refund = await withDatabaseUnit(async (unit) => {
        const updated = await patch(Refund, refund, { refundReference: body.refundReference }, unit);
        await audit(refund.order, user, "refund_reference_recovered", note, unit, { refund: refund._id });
        return updated;
      });
    }
    return queryAndRecordInLock(refund, user);
  });
};
const sweepRefunds = async () => {
  const rows = await Refund.find({ gateway: { $ne: "manual" }, $or: [{ status: { $in: ["queued", "submitting", "pending"] } }, { status: "unknown", refundReference: { $exists: true } }] }).sort({ updatedAt: 1 }).limit(30);
  for (const row of rows) try { await processRefund(row._id); } catch (error) { if (error.statusCode !== 409) console.error("Refund reconciliation needs attention for " + row._id + ":", error.message); }
};
const startRefundWorker = () => {
  let running, stopped = false;
  const tick = () => { if (stopped || running) return; running = require("./maintenanceService").withWriteLease(sweepRefunds).catch(() => console.error("Refund reconciliation sweep failed")).finally(() => { running = null; }); };
  const timer = setInterval(tick, 30000); timer.unref(); tick();
  return async () => { stopped = true; clearInterval(timer); if (running) await running; };
};
module.exports = { refundState, ACTIVE, sumRefunds, sourceRefunds, syncRefundSummary, queueRefundInUnit, requestRefund, processRefund, confirmManualRefund, reconcileRefund, sweepRefunds, startRefundWorker };

const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Refund = require("../models/Refund");
const httpError = require("../utils/httpError");
const { withOperationLock } = require("./operationLock");
const { withDatabaseUnit, querySession, writeOptions } = require("./databaseUnit");
const { objectId, noteText, patch, patchOrder, audit, ownedOrder, moneyCents } = require("./orderOperationStore");
const { canonicalCharge, verifyCharge, refreshGatewayInLock } = require("./verifiedPayments");
const { sumRefunds } = require("./refundService");
const reviewOrder = async ({ orderId, user, body }) => {
  objectId(orderId); const note = noteText(body.note);
  if (!["verify", "retain", "approve", "close_refunded", "note"].includes(body.action)) throw httpError(400, "Choose a valid payment review action");
  return withOperationLock("order:" + orderId, async () => {
    let order = await ownedOrder(orderId, user);
    if (body.action === "note") return withDatabaseUnit(async (unit) => { await audit(orderId, user, "admin_note", note, unit); return order; });
    if (body.action === "approve" && order.paymentStatus === "paid" && order.paymentReviewStatus === "approved") return order;
    if (body.action === "close_refunded" && order.paymentReviewStatus === "refunded") return order;
    if (order.paymentMethod === "cod") throw httpError(409, "Cash orders do not use gateway payment review");
    order = await refreshGatewayInLock(order);
    if (body.action === "verify") return withDatabaseUnit(async (unit) => { await audit(orderId, user, "gateway_verified", note, unit); return order; });
    if (order.paymentStatus !== "review") throw httpError(409, "This order is not waiting for payment review");
    const payments = await Payment.find({ order: orderId }).sort({ createdAt: 1 });
    const charges = [], seen = new Set();
    for (const payment of payments.filter((p) => ["paid", "review"].includes(p.status))) {
      const ids = payment.gateway === "demo" ? [""] : [...new Set([payment.validationId, ...(payment.duplicateValidationIds || [])].filter(Boolean))];
      for (const id of ids) {
        const source = await verifyCharge(order, payment, id);
        if (!seen.has(source.bankTransactionId)) { charges.push(source); seen.add(source.bankTransactionId); }
      }
    }
    if (!charges.length) throw httpError(409, "No matching captured charge was verified. Refresh gateway history first.");
    const refunds = await Refund.find({ order: orderId });
    const returned = (source, completedOnly = false) => sumRefunds(refunds.filter((r) => r.bankTransactionId === source.bankTransactionId && (completedOnly ? r.status === "succeeded" : r.status !== "failed")));
    if (body.action === "close_refunded") {
      if (charges.some((source) => returned(source, true) < moneyCents(source.amount))) throw httpError(409, "Every validated charge must be fully refunded before closing this review");
      if (order.status !== "cancelled" && order.returnStatus !== "completed") throw httpError(409, "Cancel the order or complete its return before closing a refunded review");
      return withDatabaseUnit(async (unit) => {
        const updated = await patchOrder(order, { paymentReviewStatus: "refunded", paymentStatus: order.isPaid ? "paid" : "cancelled", reviewedBy: user._id, reviewedAt: new Date(), reviewResolutionNote: note, paymentReviewReason: "" }, unit);
        await audit(orderId, user, "payment_review_refunded", note, unit);
        return updated;
      });
    }
    if (["requested", "approved", "completed"].includes(order.cancellationStatus) || ["approved", "received", "completed"].includes(order.returnStatus)) throw httpError(409, "Resolve the cancellation or return request before approving fulfillment");
    if (["shipped", "delivered"].includes(order.status) || (order.status === "cancelled" && !order.reservationExpiredAt)) throw httpError(409, "A manually cancelled or fulfilled order cannot be reopened through payment approval");
    const canonical = canonicalCharge(order, payments);
    const selected = body.paymentId ? charges.find((source) => String(source.payment._id) === String(body.paymentId) && (!body.validationId || source.validationId === body.validationId)) : charges.find((source) => String(source.payment._id) === String(canonical?.payment?._id) && source.validationId === canonical.validationId);
    if (!selected) throw httpError(400, "Choose the verified payment to retain for this order");
    if (body.action === "retain") {
      if (refunds.some((r) => r.scope === "order" && r.status !== "failed")) throw httpError(409, "The retained charge cannot change after an order refund was recorded");
      if (returned(selected) > 0) throw httpError(409, "A refunded or pending-refund charge cannot be retained");
      return withDatabaseUnit(async (unit) => {
        const updated = await patchOrder(order, { settledPayment: selected.payment._id, settledValidationId: selected.validationId, settledBankTransactionId: selected.bankTransactionId }, unit);
        await audit(orderId, user, "payment_review_retained_charge", note, unit, { payment: selected.payment._id });
        return updated;
      });
    }
    if (canonical && (String(canonical.payment._id) !== String(selected.payment._id) || canonical.validationId !== selected.validationId)) throw httpError(409, "Retain the selected charge first, then refund the additional charges before approving it");
    if (selected.riskLevel === 1 && body.acknowledgeRisk !== true) throw httpError(409, "The gateway marked this payment risky. Explicit risk approval and an audit note are required.");
    if (returned(selected) > 0) throw httpError(409, "A retained payment with a pending or completed refund cannot fund fulfillment");
    if (charges.some((source) => source !== selected && returned(source, true) < moneyCents(source.amount))) throw httpError(409, "Refund the additional validated charges before approving the retained payment");
    return withDatabaseUnit(async (unit) => {
      order = await querySession(Order.findById(orderId), unit.session);
      if (order.stockRestored) for (const item of order.items) await require("./inventoryService").reserveItem(item, unit);
      await patch(Payment, selected.payment, { status: "paid", paidAt: selected.payment.paidAt || new Date() }, unit);
      const updated = await patchOrder(order, { isPaid: true, paymentStatus: "paid", paidAt: order.paidAt || new Date(), paidTransactionId: selected.payment.transactionId,
        status: "processing", stockRestored: false, reservationExpiredAt: null, cancelledAt: null, cancelReason: "",
        settledPayment: selected.payment._id, settledValidationId: selected.validationId, settledBankTransactionId: selected.bankTransactionId,
        paymentReviewStatus: "approved", reviewedBy: user._id, reviewedAt: new Date(), reviewResolutionNote: note, paymentReviewReason: "" }, unit);
      await audit(orderId, user, "payment_review_approved", note, unit, { payment: selected.payment._id });
      return updated;
    });
  });
};
module.exports = { reviewOrder };

const Order = require("../models/Order");
const Payment = require("../models/Payment");
const httpError = require("../utils/httpError");
const gateway = require("./sslcommerzService");
const { syncInvoicePayment } = require("./invoiceService");
const { querySession, withDatabaseUnit, writeOptions } = require("./databaseUnit");
const { withOperationLock } = require("./operationLock");
const { expireInUnit } = require("./reservationService");

const paymentFields = (payment) => ({
  status: payment.status, failureReason: payment.failureReason || "", validationId: payment.validationId || "",
  bankTransactionId: payment.bankTransactionId || "", cardType: payment.cardType || "", riskLevel: payment.riskLevel || 0,
  paidAt: payment.paidAt || null, duplicateValidationIds: [...(payment.duplicateValidationIds || [])],
});
const orderFields = (order) => ({
  status: order.status, isPaid: order.isPaid, paymentStatus: order.paymentStatus,
  paymentReviewReason: order.paymentReviewReason || "", paymentReviewStatus: order.paymentReviewStatus || "none", paidAt: order.paidAt || null, paidTransactionId: order.paidTransactionId || "",
});
const unsuccessfulInUnit = async (payment, order, outcome, reason, unit) => {
  const { session, compensate } = unit;
  if (!payment || ["paid", "review"].includes(payment.status) || order?.isPaid || order?.paymentStatus === "review") return payment;
  const previousPayment = paymentFields(payment);
  const updatedPayment = await Payment.findOneAndUpdate({ _id: payment._id, status: { $nin: ["paid", "review"] } },
    { $set: { status: outcome, failureReason: String(reason || outcome).slice(0, 500) } }, writeOptions(session, { new: true }));
  if (!updatedPayment) return payment;
  compensate(() => Payment.updateOne({ _id: payment._id }, { $set: previousPayment }));
  // An old attempt's failure must not overwrite a newer attempt's state.
  if (order && order.status !== "cancelled" && (!order.transactionId || order.transactionId === payment.transactionId)) {
    const previousOrder = orderFields(order);
    const updatedOrder = await Order.findOneAndUpdate({ _id: order._id, isPaid: false },
      { $set: { paymentStatus: outcome === "cancelled" ? "cancelled" : "failed" } }, writeOptions(session, { new: true }));
    if (updatedOrder) {
      compensate(async () => { await Order.updateOne({ _id: order._id }, { $set: previousOrder }); await syncInvoicePayment({ ...order.toObject(), ...previousOrder }); });
      await syncInvoicePayment(updatedOrder, session);
    }
  }
  return updatedPayment;
};
const markPaymentUnsuccessful = async (transactionId, outcome, reason) => {
  if (typeof transactionId !== "string" || transactionId.length > 100) return null;
  const reference = await Payment.findOne({ transactionId });
  if (!reference || reference.gateway === "demo") return null;
  return withOperationLock("order:" + reference.order, () => withDatabaseUnit(async (unit) => {
    const payment = await querySession(Payment.findOne({ transactionId }), unit.session);
    const order = payment && await querySession(Order.findById(payment.order), unit.session);
    return unsuccessfulInUnit(payment, order, outcome, reason, unit);
  }));
};

// Call only while holding order:<id>. Used by callback and retry reconciliation.
const captureInUnit = async (payment, order, result, validationId, unit) => {
  const { session, compensate } = unit;
  if (!payment || !order) return { ok: false, reason: "Order or payment record not found" };
  const verification = gateway.verifyPaymentForOrder(result, payment);
  if (!verification.sameTransaction || !verification.sameAmount || !verification.sameCurrency || !verification.validStatus) {
    return { ok: false, order, reason: "Payment details did not match the saved order" };
  }
  const incomingValidation = String(result.val_id || validationId).slice(0, 100);
  const incomingBank = String(result.bank_tran_id || "").slice(0, 100);
  const knownValidation = incomingValidation === payment.validationId || (payment.duplicateValidationIds || []).includes(incomingValidation);
  const anotherCharge = Boolean(payment.validationId && !knownValidation &&
    !(incomingBank && payment.bankTransactionId && incomingBank === payment.bankTransactionId));
  if (["paid", "review"].includes(payment.status) && (order.isPaid || order.paymentStatus === "review") && !anotherCharge) {
    await syncInvoicePayment(order, session);
    return { ok: true, review: order.paymentStatus === "review", order };
  }
  order = await expireInUnit(order, unit);
  const late = order.status === "cancelled" || order.stockRestored;
  const otherPaidAttempt = Boolean(order.isPaid && (order.paidTransactionId || order.transactionId) !== payment.transactionId);
  const review = late || anotherCharge || otherPaidAttempt || !verification.valid || order.paymentStatus === "review";
  const reviewReason = order.paymentReviewReason || (late
    ? "A validated payment arrived after cancellation or reservation expiry. Store review is required; inventory remains restored."
    : anotherCharge || otherPaidAttempt ? "More than one validated payment was received for this order. Store review is required."
    : review ? "The gateway marked this transaction for risk review." : "");
  const paidAt = order.paidAt || (verification.valid ? payment.paidAt || new Date() : null);
  const previousPayment = paymentFields(payment);
  const duplicateValidationIds = [...(payment.duplicateValidationIds || [])];
  if (anotherCharge && !duplicateValidationIds.includes(incomingValidation)) duplicateValidationIds.push(incomingValidation);
  const updatedPayment = await Payment.findOneAndUpdate({ _id: payment._id }, { $set: {
    status: payment.status === "paid" || verification.valid ? "paid" : "review",
    validationId: payment.validationId || incomingValidation,
    bankTransactionId: payment.bankTransactionId || incomingBank,
    cardType: payment.cardType || String(result.card_type || "").slice(0, 100),
    duplicateValidationIds: duplicateValidationIds.slice(-20), riskLevel: verification.riskLevel, failureReason: reviewReason,
    paidAt: payment.paidAt || (verification.valid ? new Date() : null),
  } }, writeOptions(session, { new: true }));
  if (!updatedPayment) throw httpError(409, "Payment record changed");
  compensate(() => Payment.updateOne({ _id: payment._id }, { $set: previousPayment }));
  const previousOrder = orderFields(order);
  const updatedOrder = await Order.findOneAndUpdate({ _id: order._id }, { $set: {
    paymentReviewStatus: review ? "open" : order.paymentReviewStatus || "none",
    isPaid: Boolean(order.isPaid || verification.valid), paymentStatus: review ? "review" : "paid", paymentReviewReason: reviewReason,
    paidAt, paidTransactionId: order.paidTransactionId || (verification.valid ? payment.transactionId : ""),
    status: !review && order.status === "pending" ? "processing" : order.status,
  } }, writeOptions(session, { new: true }));
  if (!updatedOrder) throw httpError(409, "Order record changed");
  compensate(async () => { await Order.updateOne({ _id: order._id }, { $set: previousOrder }); await syncInvoicePayment({ ...order.toObject(), ...previousOrder }); });
  await syncInvoicePayment(updatedOrder, session);
  return { ok: true, review, order: updatedOrder };
};
const validateAndCapture = async (transactionId, validationId) => {
  if (typeof transactionId !== "string" || transactionId.length > 100 || typeof validationId !== "string" || validationId.length > 100) return { ok: false, reason: "Invalid payment notification" };
  const reference = await Payment.findOne({ transactionId });
  if (!reference || reference.gateway === "demo") return { ok: false, reason: "Payment record not found" };
  const result = await gateway.validatePayment(validationId);
  return withOperationLock("order:" + reference.order, () => withDatabaseUnit(async (unit) => {
    const payment = await querySession(Payment.findOne({ transactionId }), unit.session);
    const order = payment && await querySession(Order.findById(payment.order), unit.session);
    return captureInUnit(payment, order, result, validationId, unit);
  }));
};
module.exports = { paymentFields, orderFields, unsuccessfulInUnit, markPaymentUnsuccessful, captureInUnit, validateAndCapture };

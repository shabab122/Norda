const Payment = require("../models/Payment");
const Order = require("../models/Order");
const gateway = require("./sslcommerzService");
const httpError = require("../utils/httpError");
const { captureInUnit } = require("./paymentStateService");
const { withDatabaseUnit, querySession } = require("./databaseUnit");
const { objectId } = require("./orderOperationStore");
const canonicalCharge = (order, payments) => {
  const payment = payments.find((p) => String(p._id) === String(order.settledPayment || "")) || payments.find((p) => p.transactionId === order.paidTransactionId) || payments.find((p) => p.transactionId === order.transactionId && ["paid", "review"].includes(p.status)) || payments.find((p) => ["paid", "review"].includes(p.status));
  return payment ? { payment, validationId: order.settledValidationId || payment.validationId || "", bankTransactionId: order.settledBankTransactionId || payment.bankTransactionId || "" } : null;
};
const verifyCharge = async (order, payment, validationId) => {
  if (!payment || String(payment.order) !== String(order._id)) throw httpError(404, "Payment not found for this order");
  if (payment.gateway === "demo") {
    if (payment.status !== "paid" || !order.isPaid) throw httpError(409, "This simulation has no completed payment to refund");
    return { payment, validationId: "", bankTransactionId: "SIM:" + payment.transactionId, amount: payment.amount, riskLevel: 0, gateway: "demo" };
  }
  if (!gateway.isConfigured()) throw httpError(503, "Configure the existing SSLCOMMERZ connection before verifying or refunding a real payment");
  const id = validationId || payment.validationId;
  if (!id || ![payment.validationId, ...(payment.duplicateValidationIds || [])].includes(id)) throw httpError(409, "This charge has no recorded validation reference. Refresh gateway verification first.");
  const result = await gateway.validatePayment(id);
  const checked = gateway.verifyPaymentForOrder(result, payment);
  const bank = String(result.bank_tran_id || "");
  if (!checked.validStatus || !checked.sameTransaction || !checked.sameAmount || Math.round(Number(result.amount) * 100) !== Math.round(Number(payment.amount) * 100) || !checked.sameCurrency || ![0, 1].includes(checked.riskLevel) || result.val_id !== id || !bank || bank.length > 80 || (id === payment.validationId && payment.bankTransactionId && bank !== payment.bankTransactionId)) throw httpError(409, "The gateway validation does not match this saved charge. No refund or approval was made.");
  return { payment, validationId: id, bankTransactionId: bank, amount: Number(payment.amount), riskLevel: checked.riskLevel, gateway: "sslcommerz" };
};
const refundSource = async (order, paymentId, validationId) => {
  const payments = await Payment.find({ order: order._id }).sort({ createdAt: 1 });
  if (order.paymentMethod === "cod") {
    if (!order.isPaid) throw httpError(409, "No cash payment is recorded for this order");
    return { gateway: "manual", amount: order.totalAmount, validationId: "", bankTransactionId: "COD:" + order._id, payment: null, scope: "order" };
  }
  const canonical = canonicalCharge(order, payments);
  const selected = paymentId ? payments.find((p) => String(p._id) === String(objectId(paymentId))) : canonical?.payment;
  const source = await verifyCharge(order, selected, validationId || (selected && String(selected._id) === String(canonical?.payment?._id) ? canonical.validationId : selected?.validationId));
  const canonicalBank = canonical?.bankTransactionId || (canonical && String(canonical.payment._id) === String(source.payment._id) && canonical.validationId === source.validationId ? source.bankTransactionId : "");
  source.scope = canonicalBank === source.bankTransactionId || (source.gateway === "demo" && canonical && String(canonical.payment._id) === String(source.payment._id)) ? "order" : "extra_payment";
  if (!canonical) throw httpError(409, "The order's original payment needs review before refunding");
  return source;
};
// Caller holds the distributed order lock. Remote calls stay outside DB transactions.
const refreshGatewayInLock = async (order) => {
  if (order.paymentMethod !== "sslcommerz") return order;
  if (!gateway.isConfigured()) throw httpError(503, "SSLCOMMERZ is unavailable for verification");
  const attempts = await Payment.find({ order: order._id, gateway: { $ne: "demo" } });
  for (const payment of attempts) {
    const data = await gateway.queryPayment({ transactionId: payment.transactionId });
    if (data.APIConnect !== "DONE" || !Array.isArray(data.element) || Number(data.no_of_trans_found) !== data.element.length || data.element.length > 30) throw httpError(502, "The gateway payment history is incomplete");
    for (const row of data.element) {
      if (row.tran_id !== payment.transactionId || !["VALID", "VALIDATED", "PENDING", "UNATTEMPTED", "FAILED", "CANCELLED", "EXPIRED"].includes(row.status)) throw httpError(502, "The gateway returned an unclear transaction history");
      if (!["VALID", "VALIDATED"].includes(row.status)) continue;
      if (typeof row.val_id !== "string" || !row.val_id || row.val_id.length > 100) throw httpError(502, "Missing gateway validation reference");
      const result = await gateway.validatePayment(row.val_id);
      const captured = await withDatabaseUnit(async (unit) => captureInUnit(await querySession(Payment.findById(payment._id), unit.session), await querySession(Order.findById(order._id), unit.session), result, row.val_id, unit));
      if (!captured.ok) throw httpError(409, "A gateway transaction did not match the saved payment");
      order = captured.order;
    }
  }
  return order;
};
module.exports = { canonicalCharge, verifyCharge, refundSource, refreshGatewayInLock };

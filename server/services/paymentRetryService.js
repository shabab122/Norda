const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Invoice = require("../models/Invoice");
const Product = require("../models/Product");
const httpError = require("../utils/httpError");
const gateway = require("./sslcommerzService");
const { nextReservationDeadline } = require("../config/reservations");
const { normalizeCheckoutKey } = require("./orderService");
const { expireInUnit } = require("./reservationService");
const { captureInUnit, markPaymentUnsuccessful } = require("./paymentStateService");
const { syncInvoicePayment } = require("./invoiceService");
const { insertDocument, querySession, withDatabaseUnit, writeOptions } = require("./databaseUnit");
const { withOperationLock } = require("./operationLock");

const createTransactionId = () => "NOR" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(8).toString("hex").toUpperCase();
const assertRecoverable = (order) => {
  if (order.paymentMethod !== "sslcommerz") throw httpError(409, "This order does not use SSLCOMMERZ");
  if (order.paymentStatus === "review") throw httpError(409, "This payment needs store review before another attempt");
  if (["shipped", "delivered"].includes(order.status) || (order.status === "cancelled" && !order.reservationExpiredAt)) throw httpError(409, "This order cannot be reopened for payment");
};
const requireRows = (data, payment, sessionQuery = false) => {
  if (data.APIConnect !== "DONE") throw httpError(502, "The previous payment could not be checked. Please try again later.");
  const rows = sessionQuery ? [data] : data.element;
  if (!Array.isArray(rows) || (!sessionQuery && (!Number.isInteger(Number(data.no_of_trans_found)) || Number(data.no_of_trans_found) !== rows.length))) throw httpError(502, "The gateway returned an incomplete payment history");
  if (rows.length > 30 || rows.some((row) => !row || row.tran_id !== payment.transactionId || !["VALID", "VALIDATED", "PENDING", "UNATTEMPTED", "FAILED", "CANCELLED", "EXPIRED"].includes(row.status))) throw httpError(502, "The previous payment status is unclear. Please contact the store.");
  return rows;
};
// Caller holds the order lock. Every recorded real attempt is checked, including
// old attempts whose delayed success callback has not reached this server.
const reconcileAttempts = async (order, attempts) => {
  const pending = [];
  for (const payment of attempts) {
    if (["paid", "review"].includes(payment.status) && !order.isPaid) throw httpError(409, "A recorded payment needs store review before retry");
    let rows = requireRows(await gateway.queryPayment({ transactionId: payment.transactionId }), payment);
    if (!rows.length && payment.checkoutUrl) {
      if (!payment.sessionKey) throw httpError(409, "The previous hosted payment is still unresolved. Please contact the store.");
      rows = requireRows(await gateway.queryPayment({ sessionKey: payment.sessionKey }), payment, true);
    }
    for (const row of rows.filter((entry) => ["VALID", "VALIDATED"].includes(entry.status))) {
      if (typeof row.val_id !== "string" || !row.val_id || row.val_id.length > 100) throw httpError(502, "The previous payment has no usable validation reference");
      const validation = await gateway.validatePayment(row.val_id);
      const result = await withDatabaseUnit(async (unit) => {
        const freshPayment = await querySession(Payment.findById(payment._id), unit.session);
        const freshOrder = await querySession(Order.findById(order._id), unit.session);
        return captureInUnit(freshPayment, freshOrder, validation, row.val_id, unit);
      });
      if (!result.ok) throw httpError(409, "The previous payment needs store review; another payment was not started");
      order = result.order;
    }
    if (rows.some((row) => ["PENDING", "UNATTEMPTED"].includes(row.status))) pending.push(payment);
  }
  return { order, pending };
};
const prepareReservation = async (order, unit, transactionId, renew) => {
  if (order.stockRestored) {
    if (!order.reservationExpiredAt) throw httpError(409, "This cancelled order cannot be reopened");
    for (const item of order.items) {
      const product = await Product.findOneAndUpdate({ _id: item.product, isArchived: { $ne: true }, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } }, writeOptions(unit.session, { new: true }));
      if (!product) throw httpError(409, "Not enough stock to retry payment for " + item.name + ". Your order and cart have been kept.");
      unit.compensate(() => Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }));
    }
  }
  const previous = {
    stockRestored: order.stockRestored || false, status: order.status, paymentStatus: order.paymentStatus,
    reservationExpiresAt: order.reservationExpiresAt || null, reservationExpiredAt: order.reservationExpiredAt || null,
    cancelledAt: order.cancelledAt || null, cancelReason: order.cancelReason || "", transactionId: order.transactionId || "",
  };
  const updated = await Order.findOneAndUpdate({ _id: order._id, isPaid: false }, { $set: {
    stockRestored: false, status: "pending", paymentStatus: "pending", reservationExpiredAt: null, cancelledAt: null, cancelReason: "", transactionId,
    reservationExpiresAt: renew || order.stockRestored ? nextReservationDeadline() : order.reservationExpiresAt || nextReservationDeadline(new Date(order.createdAt)),
  } }, writeOptions(unit.session, { new: true }));
  if (!updated) throw httpError(409, "The order changed before payment retry");
  unit.compensate(async () => { await Order.updateOne({ _id: order._id }, { $set: previous }); await syncInvoicePayment({ ...order.toObject(), ...previous }); });
  await syncInvoicePayment(updated, unit.session);
  return updated;
};
const retryPayment = async ({ user, orderId, retryKey }) => {
  if (!gateway.isConfigured()) throw httpError(503, "Online payment is currently unavailable. Please try again later.");
  if (!mongoose.isObjectIdOrHexString(orderId)) throw httpError(400, "Invalid order identifier");
  const key = normalizeCheckoutKey(retryKey);
  if (!key) throw httpError(400, "A payment retry request key is required");
  let attemptedPayment;
  try {
    return await withOperationLock("order:" + orderId, async () => {
      let order = await Order.findById(orderId);
      if (!order) throw httpError(404, "Order not found");
      if (String(order.user) !== String(user._id)) throw httpError(403, "Not authorized to retry this order");
      if (order.paymentStatus === "review") throw httpError(409, "This payment needs store review before another attempt");
      if (order.isPaid) return { orderId: order._id, alreadyPaid: true };
      assertRecoverable(order);
      // Expiry commits before reconciliation/reservation. A gateway outage or an
      // out-of-stock retry must not accidentally keep an expired stock hold.
      order = await withDatabaseUnit(async (unit) => expireInUnit(await querySession(Order.findById(orderId), unit.session), unit));
      const invoice = await Invoice.findOne({ order: orderId });
      if (!invoice) throw httpError(409, "This order needs invoice review before retry");
      const attempts = await Payment.find({ order: orderId, gateway: { $ne: "demo" } }).sort({ createdAt: -1 });
      const reconciliation = await reconcileAttempts(order, attempts);
      order = reconciliation.order;
      if (order.paymentStatus === "review") return { orderId: order._id, review: true };
      if (order.isPaid) return { orderId: order._id, alreadyPaid: true };
      assertRecoverable(order);
      const repeated = attempts.find((attempt) => attempt.retryKey === key);
      const active = reconciliation.pending[0];
      if (repeated && (!active || String(active._id) !== String(repeated._id))) throw httpError(409, "This retry request was already completed. Refresh your orders before trying again.");
      if (active) {
        if (!active.checkoutUrl) throw httpError(409, "The previous gateway session is still unresolved. Please try again later or contact the store.");
        const checkoutUrl = gateway.ensureGatewayUrl(active.checkoutUrl);
        await withDatabaseUnit(async (unit) => prepareReservation(await querySession(Order.findById(orderId), unit.session), unit, active.transactionId, false));
        return { orderId, invoiceNumber: invoice.invoiceNumber, checkoutUrl, resumed: true };
      }
      if (attempts.length >= 20) throw httpError(409, "This order has reached the payment retry limit. Please contact the store.");
      const transactionId = createTransactionId();
      const prepared = await withDatabaseUnit(async (unit) => {
        const fresh = await querySession(Order.findById(orderId), unit.session);
        const reserved = await prepareReservation(fresh, unit, transactionId, true);
        const payment = await insertDocument(Payment, { order: orderId, user: user._id, gateway: "sslcommerz", retryKey: key, transactionId, amount: order.totalAmount, currency: order.currency, status: "initiated" }, unit.session);
        unit.compensate(() => Payment.deleteOne({ _id: payment._id }));
        return { order: reserved, payment };
      });
      attemptedPayment = prepared.payment;
      const session = await gateway.createPaymentSession({ order: prepared.order, invoice, user, transactionId });
      await Payment.updateOne({ _id: attemptedPayment._id }, { $set: { sessionKey: session.sessionKey, checkoutUrl: gateway.ensureGatewayUrl(session.checkoutUrl) } });
      return { orderId, invoiceNumber: invoice.invoiceNumber, checkoutUrl: session.checkoutUrl, resumed: false };
    });
  } catch (error) {
    if (attemptedPayment) await markPaymentUnsuccessful(attemptedPayment.transactionId, "error", "Payment retry session could not be opened").catch(() => {});
    throw error;
  }
};
module.exports = { retryPayment, reconcileAttempts, prepareReservation };

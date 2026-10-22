const { hasBlockingOperation } = require("./orderOperationStore");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Invoice = require("../models/Invoice");
const httpError = require("../utils/httpError");
const { cancelInUnit, createOrderFromCart } = require("./orderService");
const { syncInvoicePayment } = require("./invoiceService");
const { insertDocument, querySession, withDatabaseUnit, writeOptions } = require("./databaseUnit");
const { withOperationLock } = require("./operationLock");

const { expireInUnit, reservationDeadline, isReservationDue } = require("./reservationService");

// This local simulator never contacts SSLCOMMERZ and cannot run in production.
const demoEnabled = () => process.env.NODE_ENV !== "production" && process.env.PAYMENT_DEMO_ENABLED !== "false";
const requireDemo = () => { if (!demoEnabled()) throw httpError(503, "Test payments are unavailable in this environment"); };
const ownedOrder = async (user, id, session) => {
  if (typeof id !== "string" || !mongoose.isObjectIdOrHexString(id)) throw httpError(400, "Invalid payment session");
  const order = await querySession(Order.findById(id), session);
  if (!order) throw httpError(404, "Payment order not found");
  if (String(order.user) !== String(user._id)) throw httpError(403, "This payment belongs to another account");
  if (order.paymentMethod !== "demo") throw httpError(400, "This order does not use simulated payment");
  return order;
};
const view = (payment, order, invoice) => ({
  isDemo: true, orderId: order._id, paymentId: payment._id,
  channel: payment.channel, status: payment.status, orderStatus: order.status,
  amount: order.totalAmount, currency: order.currency, invoiceNumber: invoice.invoiceNumber,
  transactionId: payment.transactionId,
  reservationExpiresAt: reservationDeadline(order), reservationExpiredAt: order.reservationExpiredAt || null, reservationDue: isReservationDue(order),
  checkoutUrl: "demo-payment.html?orderId=" + encodeURIComponent(order._id),
  resultUrl: "payment-result.html?orderId=" + encodeURIComponent(order._id),
});
const createDemoPayment = async (order, user, unit) => {
  const transactionId = "DEMO-" + crypto.randomUUID();
  const payment = await insertDocument(Payment, {
    order: order._id, user: user._id, gateway: "demo", channel: order.paymentChannel,
    transactionId, amount: order.totalAmount, currency: order.currency,
  }, unit.session);
  unit.compensate(() => Payment.deleteOne({ _id: payment._id }));
  const updated = await Order.updateOne({ _id: order._id, paymentMethod: "demo" }, { $set: { transactionId } }, writeOptions(unit.session));
  if (!updated.matchedCount) throw httpError(409, "Payment order changed");
  unit.compensate(() => Order.updateOne({ _id: order._id }, { $set: { transactionId: order.transactionId || "" } }));
  return payment;
};

const initiateDemo = async ({ user, shippingAddress, checkoutKey, channel, couponCode, expectedTotals }) => {
  requireDemo();
  if (!["mobile_banking", "card_bank"].includes(channel)) throw httpError(400, "Choose Mobile Banking/bKash or Card/Bank");
  return withOperationLock("payment-init:" + user._id, async () => {
    const { order, invoice } = await createOrderFromCart({ user, shippingAddress, checkoutKey, paymentMethod: "demo", paymentChannel: channel, couponCode, expectedTotals });
    try {
      return await withOperationLock("order:" + order._id, () => withDatabaseUnit(async (unit) => {
        const current = await expireInUnit(await querySession(Order.findById(order._id), unit.session), unit);
        let payment = await querySession(Payment.findOne({ order: order._id, gateway: "demo" }), unit.session);
        if (current.reservationExpiredAt) return view(payment || { channel: current.paymentChannel, status: "cancelled", transactionId: "" }, current, invoice);
        if (!payment) {
          if (current.status === "cancelled") throw httpError(409, "This order was cancelled");
          payment = await createDemoPayment(current, user, unit);
        }
        return view(payment, current, invoice);
      }));
    } catch (error) { error.orderId = order._id; throw error; }
  });
};

const getDemo = async (user, id) => {
  requireDemo();
  const order = await ownedOrder(user, id);
  const [payment, invoice] = await Promise.all([
    Payment.findOne({ order: order._id, gateway: "demo", user: user._id }), Invoice.findOne({ order: order._id }),
  ]);
  if (!invoice || (!payment && (order.isPaid || order.transactionId))) throw httpError(409, "This payment session needs store review");
  // A failed initialization can be resumed from My Orders without a new cart.
  // This GET is read-only; the missing attempt is created by the explicit POST.
  return view(payment || { channel: order.paymentChannel, status: order.status === "cancelled" ? "cancelled" : "initiated", transactionId: "" }, order, invoice);
};

const completeDemo = async (user, id, outcome) => {
  requireDemo();
  if (!["success", "failure", "cancel"].includes(outcome)) throw httpError(400, "Choose a valid test outcome");
  // Ownership is checked before and after acquiring the distributed order lock.
  await ownedOrder(user, id);
  const result = await withOperationLock("order:" + id, () => withDatabaseUnit(async (unit) => {
    const { session, compensate } = unit;
    let order = await ownedOrder(user, id, session);
    order = await expireInUnit(order, unit);
    if (order.reservationExpiredAt) return { reservationExpired: true };
    if (hasBlockingOperation(order)) throw httpError(409, "Resolve the cancellation, return or refund before completing payment");
    let payment = await querySession(Payment.findOne({ order: order._id, gateway: "demo", user: user._id }), session);
    const invoice = await querySession(Invoice.findOne({ order: order._id }), session);
    if (!invoice) throw httpError(409, "Payment records need store review");
    if (!payment) {
      if (order.status !== "pending" || order.isPaid || order.transactionId) throw httpError(409, "This payment cannot be resumed. Check My Orders.");
      payment = await createDemoPayment(order, user, unit);
    }
    const status = { success: "paid", failure: "failed", cancel: "cancelled" }[outcome];
    if (payment.status !== "initiated") {
      if (payment.status !== status) throw httpError(409, "This payment already finished with a different outcome");
      return { ...view(payment, order, invoice), replayed: true };
    }
    if (order.status === "cancelled" || order.stockRestored || order.isPaid) throw httpError(409, "This order has already changed. Check My Orders.");
    const notificationPrevious = order.toObject();
    if (outcome === "success") {
      const previous = { isPaid: order.isPaid, paymentStatus: order.paymentStatus, status: order.status, paidAt: order.paidAt || null };
      const original = order.toObject();
      order = await Order.findOneAndUpdate({ _id: order._id, isPaid: false, paymentMethod: "demo" },
        { $set: { isPaid: true, paymentStatus: "paid", status: "processing", paidAt: new Date() } }, writeOptions(session, { new: true }));
      if (!order) throw httpError(409, "Payment order changed");
      compensate(async () => { await Order.updateOne({ _id: original._id }, { $set: previous }); await syncInvoicePayment({ ...original, ...previous }); });
    } else {
      // A failed/cancelled simulation releases its reservation exactly once.
      order = await cancelInUnit(order, outcome === "failure" ? "Payment failed; no money was charged" : "Checkout cancelled; no money was charged", unit);
      if (outcome === "failure") {
        const cancelled = order.toObject();
        order = await Order.findOneAndUpdate({ _id: order._id }, { $set: { paymentStatus: "failed" } }, writeOptions(session, { new: true }));
        compensate(async () => { await Order.updateOne({ _id: cancelled._id }, { $set: { paymentStatus: cancelled.paymentStatus } }); await syncInvoicePayment(cancelled); });
      }
    }
    const updated = await Payment.findOneAndUpdate({ _id: payment._id, gateway: "demo", status: "initiated" }, { $set: {
      status, paidAt: outcome === "success" ? order.paidAt : null,
      failureReason: outcome === "success" ? "" : "Demo simulation: " + outcome,
      cardType: payment.channel === "mobile_banking" ? "DEMO bKash" : "DEMO Card/Bank",
    } }, writeOptions(session, { new: true }));
    if (!updated) throw httpError(409, "Payment session changed");
    compensate(() => Payment.updateOne({ _id: payment._id }, { $set: { status: payment.status, paidAt: payment.paidAt || null, failureReason: payment.failureReason || "", cardType: payment.cardType || "" } }));
    const synced = await syncInvoicePayment(order, session, unit, notificationPrevious);
    if (!synced) throw httpError(409, "Payment invoice needs store review");
    return { ...view(updated, order, synced), replayed: false };
  }));
  if (result.reservationExpired) throw httpError(409, "This payment reservation expired and its stock was released. Please check My Orders.");
  return result;
};

module.exports = { demoEnabled, initiateDemo, getDemo, completeDemo };

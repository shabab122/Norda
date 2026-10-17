const crypto = require("node:crypto");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const httpError = require("../utils/httpError");
const { createOrderFromCart } = require("../services/orderService");
const { syncInvoicePayment } = require("../services/invoiceService");
const { querySession, withDatabaseUnit, writeOptions } = require("../services/databaseUnit");
const { withOperationLock } = require("../services/operationLock");
const gateway = require("../services/sslcommerzService");
const { demoEnabled } = require("../services/demoPaymentService");

const createTransactionId = () => "NOR" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(8).toString("hex").toUpperCase();
const resultUrl = (status, orderId) => {
  const base = String(process.env.CLIENT_APP_URL || "http://localhost:5000").replace(/\/+$/, "") + "/";
  const url = new URL("payment-result.html", base);
  url.searchParams.set("status", status);
  if (orderId) url.searchParams.set("orderId", orderId.toString());
  return url.toString();
};
const getPaymentConfig = (req, res) => res.json({ sslcommerzEnabled: gateway.isConfigured(), environment: gateway.isLive() ? "live" : "sandbox", demoEnabled: demoEnabled(), demoChannels: ["mobile_banking", "card_bank"] });

const initiateSslcommerz = async (req, res, next) => {
  if (!gateway.isConfigured()) return res.status(503).json({ message: "Online payment is currently unavailable. Please choose cash on delivery." });
  let order;
  let invoice;
  let payment;
  let initializationStarted = false;
  try {
    const result = await withOperationLock("payment-init:" + req.user._id, async () => {
      ({ order, invoice } = await createOrderFromCart({
        user: req.user, shippingAddress: req.body.shippingAddress,
        paymentMethod: "sslcommerz", checkoutKey: req.body.checkoutKey,
      }));
      if (order.paymentStatus === "review" || order.status === "cancelled") throw httpError(409, "This order needs store review; a new payment cannot be started.");
      if (order.isPaid) return { orderId: order._id, invoiceNumber: invoice.invoiceNumber, alreadyPaid: true };
      payment = await Payment.findOne({ order: order._id }).sort({ createdAt: -1 });
      if (payment?.checkoutUrl && payment.status === "initiated") {
        return { orderId: order._id, invoiceNumber: invoice.invoiceNumber, checkoutUrl: gateway.ensureGatewayUrl(payment.checkoutUrl) };
      }
      if (payment) throw httpError(409, "A payment attempt is already recorded. Check your order before trying again.");
      const transactionId = createTransactionId();
      initializationStarted = true;
      payment = await Payment.create({ order: order._id, user: req.user._id, transactionId, amount: order.totalAmount, currency: order.currency });
      await Order.updateOne({ _id: order._id }, { $set: { transactionId } });
      const session = await gateway.createPaymentSession({ order, invoice, user: req.user, transactionId });
      // A callback may already have advanced this record. Session metadata must
      // never overwrite its financial state with a stale document save.
      await Payment.updateOne({ _id: payment._id }, { $set: { sessionKey: session.sessionKey, checkoutUrl: session.checkoutUrl } });
      return { orderId: order._id, invoiceNumber: invoice.invoiceNumber, checkoutUrl: session.checkoutUrl };
    });
    res.status(201).json(result);
  } catch (error) {
    if (order && initializationStarted) {
      const recordFailure = payment
        ? markPaymentUnsuccessful(payment.transactionId, "error", "Payment session could not be opened")
        : withOperationLock("order:" + order._id, () => withDatabaseUnit(async (unit) => {
            const current = await querySession(Order.findById(order._id), unit.session);
            if (!current || current.isPaid || current.status === "cancelled" || current.paymentStatus === "review") return;
            const previous = orderFields(current);
            const updated = await Order.findOneAndUpdate({ _id: order._id, isPaid: false }, { $set: { paymentStatus: "failed" } }, writeOptions(unit.session, { new: true }));
            if (!updated) return;
            unit.compensate(async () => { await Order.updateOne({ _id: order._id }, { $set: previous }); await syncInvoicePayment({ ...current.toObject(), ...previous }); });
            await syncInvoicePayment(updated, unit.session);
          }));
      await recordFailure.catch((failure) => console.error("Payment initialization state update failed:", failure.message));
    }
    if (order) return res.status(error.statusCode || 502).json({
      message: error.statusCode && error.statusCode < 500 ? error.message : "We could not open online payment. Please check the saved order before trying again.",
      orderId: order._id, invoiceNumber: invoice?.invoiceNumber,
    });
    next(error);
  }
};

const paymentFields = (payment) => ({
  status: payment.status, failureReason: payment.failureReason || "", validationId: payment.validationId || "",
  bankTransactionId: payment.bankTransactionId || "", cardType: payment.cardType || "", riskLevel: payment.riskLevel || 0, paidAt: payment.paidAt || null,
});
const orderFields = (order) => ({
  status: order.status, isPaid: order.isPaid, paymentStatus: order.paymentStatus,
  paymentReviewReason: order.paymentReviewReason || "", paidAt: order.paidAt || null,
});

const markPaymentUnsuccessful = async (transactionId, outcome, reason) => {
  if (typeof transactionId !== "string" || transactionId.length > 100) return null;
  const reference = await Payment.findOne({ transactionId });
  if (!reference || reference.gateway === "demo") return null;
  return withOperationLock("order:" + reference.order, () => withDatabaseUnit(async (unit) => {
    const { session, compensate } = unit;
    const payment = await querySession(Payment.findOne({ transactionId }), session);
    const order = payment && await querySession(Order.findById(payment.order), session);
    // Failure/cancellation notifications are hints. They cannot undo validated
    // payment, dismiss a review, cancel fulfillment, or release stock.
    if (!payment || ["paid", "review"].includes(payment.status) || order?.isPaid || order?.paymentStatus === "review") return payment;
    const previousPayment = paymentFields(payment);
    const updatedPayment = await Payment.findOneAndUpdate({ _id: payment._id, status: { $nin: ["paid", "review"] } },
      { $set: { status: outcome, failureReason: String(reason || outcome).slice(0, 500) } }, writeOptions(session, { new: true }));
    if (!updatedPayment) return payment;
    compensate(() => Payment.updateOne({ _id: payment._id }, { $set: previousPayment }));
    if (order && order.status !== "cancelled") {
      const previousOrder = orderFields(order);
      const updatedOrder = await Order.findOneAndUpdate({ _id: order._id, isPaid: false },
        { $set: { paymentStatus: outcome === "cancelled" ? "cancelled" : "failed" } }, writeOptions(session, { new: true }));
      if (updatedOrder) {
        compensate(async () => {
          await Order.updateOne({ _id: order._id }, { $set: previousOrder });
          await syncInvoicePayment({ ...order.toObject(), ...previousOrder });
        });
        await syncInvoicePayment(updatedOrder, session);
      }
    }
    return updatedPayment;
  }));
};

const validateAndCapture = async (transactionId, validationId) => {
  if (typeof transactionId !== "string" || transactionId.length > 100 || typeof validationId !== "string" || validationId.length > 100) {
    return { ok: false, reason: "Invalid payment notification" };
  }
  const reference = await Payment.findOne({ transactionId });
  if (!reference || reference.gateway === "demo") return { ok: false, reason: "Payment record not found" };
  const gatewayResult = await gateway.validatePayment(validationId);
  return withOperationLock("order:" + reference.order, () => withDatabaseUnit(async (unit) => {
    const { session, compensate } = unit;
    const payment = await querySession(Payment.findOne({ transactionId }), session);
    const order = payment && await querySession(Order.findById(payment.order), session);
    if (!payment || !order) return { ok: false, reason: "Order or payment record not found" };
    const verification = gateway.verifyPaymentForOrder(gatewayResult, payment);
    // Mismatched callbacks cannot corrupt an otherwise valid payment attempt.
    if (!verification.sameTransaction || !verification.sameAmount || !verification.sameCurrency || !verification.validStatus) {
      return { ok: false, order, reason: "Payment details did not match the saved order" };
    }
    if (payment.status === "paid" && order.isPaid) {
      await syncInvoicePayment(order, session);
      return { ok: true, review: order.paymentStatus === "review", order };
    }
    const late = order.status === "cancelled" || order.stockRestored;
    const review = late || !verification.valid;
    const reviewReason = late
      ? "A validated payment arrived after cancellation. Store review is required; inventory remains restored."
      : review ? "The gateway marked this transaction for risk review." : "";
    const paidAt = verification.valid ? payment.paidAt || new Date() : null;
    const previousPayment = paymentFields(payment);
    const updatedPayment = await Payment.findOneAndUpdate({ _id: payment._id }, { $set: {
      status: verification.valid ? "paid" : "review", validationId: String(gatewayResult.val_id || validationId).slice(0, 100),
      bankTransactionId: String(gatewayResult.bank_tran_id || "").slice(0, 100), cardType: String(gatewayResult.card_type || "").slice(0, 100),
      riskLevel: verification.riskLevel, failureReason: reviewReason, paidAt,
    } }, writeOptions(session, { new: true }));
    if (!updatedPayment) throw httpError(409, "Payment record changed");
    compensate(() => Payment.updateOne({ _id: payment._id }, { $set: previousPayment }));
    const previousOrder = orderFields(order);
    const updatedOrder = await Order.findOneAndUpdate({ _id: order._id }, { $set: {
      isPaid: verification.valid, paymentStatus: review ? "review" : "paid", paymentReviewReason: reviewReason,
      paidAt, status: !review && order.status === "pending" ? "processing" : order.status,
    } }, writeOptions(session, { new: true }));
    if (!updatedOrder) throw httpError(409, "Order record changed");
    compensate(async () => {
      await Order.updateOne({ _id: order._id }, { $set: previousOrder });
      await syncInvoicePayment({ ...order.toObject(), ...previousOrder });
    });
    await syncInvoicePayment(updatedOrder, session);
    return { ok: true, review, order: updatedOrder };
  }));
};

const sslcommerzSuccess = async (req, res) => {
  try {
    const result = await validateAndCapture(req.body.tran_id, req.body.val_id);
    res.redirect(303, resultUrl(result.review ? "review" : result.ok ? "success" : "pending", result.order?._id));
  } catch (error) {
    console.error("Payment confirmation could not complete:", error.message);
    res.redirect(303, resultUrl("pending"));
  }
};
const sslcommerzFail = async (req, res) => {
  const payment = await markPaymentUnsuccessful(req.body.tran_id, "failed", "Gateway reported an incomplete payment").catch(() => null);
  res.redirect(303, resultUrl("failed", payment?.order));
};
const sslcommerzCancel = async (req, res) => {
  const payment = await markPaymentUnsuccessful(req.body.tran_id, "cancelled", "Customer left hosted checkout").catch(() => null);
  res.redirect(303, resultUrl("cancelled", payment?.order));
};
const sslcommerzIpn = async (req, res) => {
  try {
    if (["VALID", "VALIDATED"].includes(req.body.status) && req.body.val_id) {
      const result = await validateAndCapture(req.body.tran_id, req.body.val_id);
      return res.status(result.ok ? 200 : 422).json({ received: true, valid: result.ok, review: Boolean(result.review) });
    }
    await markPaymentUnsuccessful(req.body.tran_id, req.body.status === "CANCELLED" ? "cancelled" : "failed", "Gateway reported an incomplete payment");
    res.json({ received: true });
  } catch (error) {
    console.error("Payment notification failed:", error.message);
    res.status(503).json({ received: false, message: "Payment notification could not be processed. Please retry." });
  }
};

module.exports = { getPaymentConfig, initiateSslcommerz, markPaymentUnsuccessful, sslcommerzCancel, sslcommerzFail, sslcommerzIpn, sslcommerzSuccess, validateAndCapture };

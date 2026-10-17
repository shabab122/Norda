const Cart = require("../models/Cart");
const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const store = require("../config/store");
const httpError = require("../utils/httpError");
const { cleanText, effectivePrice, isPositiveInteger } = require("../utils/validation");
const { createInvoiceForOrder, syncInvoicePayment } = require("./invoiceService");
const { insertDocument, querySession, withDatabaseUnit, writeOptions } = require("./databaseUnit");
const { withOperationLock } = require("./operationLock");

const REQUIRED_ADDRESS_FIELDS = ["line1", "city", "district", "postCode", "phone"];
const normalizeShippingAddress = (value = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw httpError(400, "Please provide a delivery address");
  const address = {
    line1: cleanText(value.line1, 120), line2: cleanText(value.line2, 120),
    city: cleanText(value.city, 60), district: cleanText(value.district, 60),
    postCode: cleanText(value.postCode, 20), country: cleanText(value.country, 60) || "Bangladesh",
    phone: cleanText(value.phone, 20),
  };
  const missing = REQUIRED_ADDRESS_FIELDS.filter((field) => !address[field]);
  if (missing.length) throw httpError(400, "Shipping address is incomplete: " + missing.join(", "));
  if (!/^[+()\d\s-]{7,20}$/.test(address.phone) || address.phone.replace(/\D/g, "").length < 7) {
    throw httpError(400, "Please provide a valid phone number");
  }
  return address;
};

const calculateTotals = (items, options = {}) => {
  const threshold = options.freeShippingThreshold ?? store.freeShippingThreshold;
  const flatFee = options.flatShippingFee ?? store.flatShippingFee;
  const subtotal = Number(items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0).toFixed(2));
  const shippingFee = subtotal >= threshold ? 0 : Number(Number(flatFee).toFixed(2));
  const totalAmount = Number((subtotal + shippingFee).toFixed(2));
  if (![subtotal, shippingFee, totalAmount].every((value) => Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)))) {
    throw httpError(400, "The order amount is outside the supported range");
  }
  return { subtotal, shippingFee, totalAmount };
};

const normalizeCheckoutKey = (value) => {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{12,80}$/.test(value)) throw httpError(400, "Invalid checkout request key");
  return value;
};

const createOrderFromCart = async ({ user, shippingAddress, paymentMethod, checkoutKey, paymentChannel = "" }) => {
  if (!["cod", "sslcommerz", "demo"].includes(paymentMethod)) throw httpError(400, "Unsupported payment method");
  if (paymentMethod === "demo" && !["mobile_banking", "card_bank"].includes(paymentChannel)) throw httpError(400, "Choose a payment channel");
  const address = normalizeShippingAddress(shippingAddress);
  const key = normalizeCheckoutKey(checkoutKey);
  return withOperationLock("cart:" + user._id, () => withDatabaseUnit(async (unit) => {
    const { session, compensate } = unit;
    if (key) {
      const existing = await querySession(Order.findOne({ user: user._id, checkoutKey: key }), session);
      if (existing) {
        if (existing.paymentMethod !== paymentMethod || (paymentMethod === "demo" && existing.paymentChannel !== paymentChannel)) throw httpError(409, "This checkout was already created with a different payment method");
        const invoice = await querySession(Invoice.findOne({ order: existing._id }), session);
        if (!invoice) throw httpError(409, "This order needs store review before checkout can be repeated");
        return { order: existing, invoice, replayed: true };
      }
    }
    const cart = await querySession(Cart.findOne({ user: user._id }).populate("items.product"), session);
    if (!cart || !cart.items.length) throw httpError(400, "Your cart is empty");
    const items = cart.items.map((item) => {
      const product = item.product;
      if (!product || product.isArchived) throw httpError(409, "An item is no longer available. Remove it from your cart before checkout.");
      if (!isPositiveInteger(item.quantity)) throw httpError(400, "Invalid quantity for " + product.name);
      return { product: product._id, name: product.name, quantity: Number(item.quantity), price: effectivePrice(product), image: product.images?.[0] || "" };
    });
    const totals = calculateTotals(items);
    if (paymentMethod === "sslcommerz" && (totals.totalAmount < 10 || totals.totalAmount > 500000)) {
      throw httpError(400, "Online checkout accepts totals from ৳10 to ৳500,000. Your cart has been kept.");
    }
    // Register each successful write immediately; exceptions on the next item
    // therefore compensate all prior decrements on standalone MongoDB too.
    for (const item of items) {
      const reserved = await Product.findOneAndUpdate(
        { _id: item.product, isArchived: { $ne: true }, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } }, writeOptions(session, { new: true })
      );
      if (!reserved) throw httpError(409, "Not enough stock for " + item.name);
      compensate(() => Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }));
    }
    const order = await insertDocument(Order, {
      user: user._id, items, shippingAddress: address, ...totals, currency: store.currency,
      paymentMethod, paymentChannel, paymentStatus: "pending", ...(key ? { checkoutKey: key } : {}),
    }, session);
    compensate(() => Order.deleteOne({ _id: order._id }));
    const invoice = await createInvoiceForOrder(order, session);
    compensate(() => Invoice.deleteOne({ _id: invoice._id }));
    const previousAddress = user.address?.toObject ? user.address.toObject() : user.address;
    const updatedUser = await User.findByIdAndUpdate(user._id, { $set: { address } }, writeOptions(session, { new: true }));
    if (!updatedUser) throw httpError(401, "Your account is no longer available");
    compensate(() => User.updateOne({ _id: user._id }, previousAddress ? { $set: { address: previousAddress } } : { $unset: { address: 1 } }));
    // Clear the cart last. A failed profile/order/invoice write cannot empty it.
    const cleared = await Cart.updateOne({ _id: cart._id }, { $set: { items: [] }, $inc: { __v: 1 } }, writeOptions(session));
    if (!cleared.matchedCount) throw httpError(409, "Your cart changed. Please review it again.");
    return { order, invoice, replayed: false };
  }));
};

const ORDER_TRANSITIONS = {
  pending: ["processing", "cancelled"], processing: ["shipped", "cancelled"],
  shipped: ["delivered"], delivered: [], cancelled: [],
};
const canTransitionOrder = (from, to) => from === to || Boolean(ORDER_TRANSITIONS[from]?.includes(to));

const cancelInUnit = async (order, reason, unit) => {
  const { session, compensate } = unit;
  if (order.status === "cancelled" && order.stockRestored) {
    await syncInvoicePayment(order, session);
    return order;
  }
  if (order.isPaid || order.paymentStatus === "review") throw httpError(409, "This payment needs to be resolved before cancellation");
  if (!["pending", "processing"].includes(order.status)) throw httpError(409, "Only pending or processing unpaid orders can be cancelled");
  for (const item of order.items) {
    const restored = await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }, writeOptions(session));
    if (restored.matchedCount) compensate(() => Product.updateOne({ _id: item.product }, { $inc: { stock: -item.quantity } }));
  }
  const previous = {
    status: order.status, paymentStatus: order.paymentStatus, stockRestored: order.stockRestored || false,
    cancelledAt: order.cancelledAt || null, cancelReason: order.cancelReason || "",
  };
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, isPaid: false, status: order.status, stockRestored: { $ne: true } },
    { $set: { stockRestored: true, status: "cancelled", paymentStatus: "cancelled", cancelledAt: new Date(), cancelReason: cleanText(reason, 300) || "Cancelled by administrator" } },
    writeOptions(session, { new: true })
  );
  if (!updated) throw httpError(409, "Order changed while cancelling. Please refresh it.");
  compensate(async () => {
    await Order.updateOne({ _id: order._id }, { $set: previous });
    await syncInvoicePayment({ ...order.toObject(), ...previous });
  });
  await syncInvoicePayment(updated, session);
  return updated;
};

const cancelOrderAndRestoreStock = (order, reason = "") => withOperationLock("order:" + order._id, () => withDatabaseUnit(async (unit) => {
  const fresh = await querySession(Order.findById(order._id), unit.session);
  if (!fresh) throw httpError(404, "Order not found");
  return cancelInUnit(fresh, reason, unit);
}));

const updateOrderWorkflow = (id, body) => withOperationLock("order:" + id, () => withDatabaseUnit(async (unit) => {
  const { session, compensate } = unit;
  const order = await querySession(Order.findById(id), session);
  if (!order) throw httpError(404, "Order not found");
  const requestedStatus = body.status || order.status;
  if (!canTransitionOrder(order.status, requestedStatus)) throw httpError(409, "Order cannot move from " + order.status + " to " + requestedStatus);
  if (body.isPaid !== undefined && typeof body.isPaid !== "boolean") throw httpError(400, "Payment confirmation must be true or false");
  if (requestedStatus === "cancelled") {
    if (body.isPaid === true) throw httpError(409, "A cancelled order cannot receive a cash-payment confirmation");
    return cancelInUnit(order, body.cancelReason, unit);
  }
  if (order.paymentMethod !== "cod" && order.paymentStatus !== "paid" && ["processing", "shipped", "delivered"].includes(requestedStatus)) {
    throw httpError(409, "Online payment must be validated before fulfillment");
  }
  if (body.isPaid === false && order.isPaid) throw httpError(409, "A paid order cannot be marked unpaid");
  if (body.isPaid === true && order.paymentMethod !== "cod") throw httpError(409, "Online payments are confirmed by validated gateway callbacks");
  const previous = { status: order.status, isPaid: order.isPaid, paymentStatus: order.paymentStatus, paidAt: order.paidAt || null };
  const fields = { status: requestedStatus };
  if (body.isPaid === true || (requestedStatus === "delivered" && order.paymentMethod === "cod")) {
    Object.assign(fields, { isPaid: true, paymentStatus: "paid", paidAt: order.paidAt || new Date() });
  }
  const updated = await Order.findOneAndUpdate({ _id: id, status: order.status }, { $set: fields }, writeOptions(session, { new: true }));
  if (!updated) throw httpError(409, "Order changed. Please refresh it.");
  compensate(async () => {
    await Order.updateOne({ _id: id }, { $set: previous });
    await syncInvoicePayment({ ...order.toObject(), ...previous });
  });
  await syncInvoicePayment(updated, session);
  return updated;
}));

module.exports = { cancelInUnit, calculateTotals, canTransitionOrder, cancelOrderAndRestoreStock, createOrderFromCart, normalizeCheckoutKey, normalizeShippingAddress, updateOrderWorkflow };

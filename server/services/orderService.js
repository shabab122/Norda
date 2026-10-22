const { shipmentFields, normalizeShipment } = require("./shipmentService");
const { selection, reserveItem, restoreItem } = require("./inventoryService");
const Cart = require("../models/Cart");
const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const User = require("../models/User");
const store = require("../config/store");
const httpError = require("../utils/httpError");
const { cleanText, isPositiveInteger } = require("../utils/validation");
const { createInvoiceForOrder, syncInvoicePayment } = require("./invoiceService");
const { insertDocument, querySession, withDatabaseUnit, writeOptions } = require("./databaseUnit");
const { withOperationLock } = require("./operationLock");

const coupons = require("./couponService");
const { getSettings } = require("./storeSettingsService");

const { nextReservationDeadline } = require("../config/reservations");

const { hasBlockingOperation } = require("./orderOperationStore");

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
  const discountAmount = options.discountAmount ?? 0;
  if (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount > subtotal || Math.abs(discountAmount * 100 - Math.round(discountAmount * 100)) > 0.00001) throw httpError(400, "Invalid order discount");
  const netSubtotal = Number((subtotal - discountAmount).toFixed(2));
  const shippingFee = netSubtotal >= threshold ? 0 : Number(Number(flatFee).toFixed(2));
  const totalAmount = Number((netSubtotal + shippingFee).toFixed(2));
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

const createOrderFromCart = async ({ user, shippingAddress, paymentMethod, checkoutKey, paymentChannel = "", couponCode = "", expectedTotals }) => {
  if (!["cod", "sslcommerz", "demo"].includes(paymentMethod)) throw httpError(400, "Unsupported payment method");
  if (paymentMethod === "demo" && !["mobile_banking", "card_bank"].includes(paymentChannel)) throw httpError(400, "Choose a payment channel");
  const address = normalizeShippingAddress(shippingAddress);
  const key = normalizeCheckoutKey(checkoutKey);
  const code = coupons.normalizeCode(couponCode);
  return withOperationLock("cart:" + user._id, () => coupons.withCouponLock(code, () => withDatabaseUnit(async (unit) => {
    const { session, compensate } = unit;
    if (key) {
      const existing = await querySession(Order.findOne({ user: user._id, checkoutKey: key }), session);
      if (existing) {
        if (existing.paymentMethod !== paymentMethod || (paymentMethod === "demo" && existing.paymentChannel !== paymentChannel)) throw httpError(409, "This checkout was already created with a different payment method");
        if ((existing.coupon?.code || "") !== code) throw httpError(409, "This checkout was already created with a different coupon");
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
      const { stock, ...selected } = selection(product, item.variantId);
      return { product: product._id, name: product.name, quantity: Number(item.quantity), ...selected };
    });
    const config = await getSettings(session);
    const subtotal = calculateTotals(items, config).subtotal;
    const quote = await coupons.quoteCoupon(code, subtotal, user._id, session);
    const totals = { ...calculateTotals(items, { ...config, discountAmount: quote.discountAmount }), discountAmount: quote.discountAmount };
    if (expectedTotals !== undefined && (!expectedTotals || typeof expectedTotals !== "object" || Array.isArray(expectedTotals) || ["subtotal", "shippingFee", "discountAmount", "totalAmount"].some((key) => expectedTotals[key] !== totals[key]))) throw httpError(409, "Prices, discount or delivery changed. Refresh checkout before placing the order.");
    if (paymentMethod === "sslcommerz" && (totals.totalAmount < 10 || totals.totalAmount > 500000)) {
      throw httpError(400, "Online checkout accepts totals from ৳10 to ৳500,000. Your cart has been kept.");
    }
    // Register each successful write immediately; exceptions on the next item
    // therefore compensate all prior decrements on standalone MongoDB too.
    for (const item of items) await reserveItem(item, unit);
    const order = await insertDocument(Order, {
      user: user._id, items, shippingAddress: address, ...totals, ...(quote.coupon ? { coupon: quote.coupon } : {}), currency: store.currency,
      paymentMethod, paymentChannel, paymentStatus: "pending",
      ...(paymentMethod !== "cod" ? { reservationExpiresAt: nextReservationDeadline() } : {}), ...(key ? { checkoutKey: key } : {}),
    }, session);
    compensate(() => Order.deleteOne({ _id: order._id }));
    await coupons.recordRedemption(order, unit);
    const invoice = await createInvoiceForOrder(order, session, unit);
    const previousAddress = user.address?.toObject ? user.address.toObject() : user.address;
    const updatedUser = await User.findByIdAndUpdate(user._id, { $set: { address } }, writeOptions(session, { new: true }));
    if (!updatedUser) throw httpError(401, "Your account is no longer available");
    compensate(() => User.updateOne({ _id: user._id }, previousAddress ? { $set: { address: previousAddress } } : { $unset: { address: 1 } }));
    // Clear the cart last. A failed profile/order/invoice write cannot empty it.
    const cleared = await Cart.updateOne({ _id: cart._id }, { $set: { items: [] }, $inc: { __v: 1 } }, writeOptions(session));
    if (!cleared.matchedCount) throw httpError(409, "Your cart changed. Please review it again.");
    return { order, invoice, replayed: false };
  })));
};

const ORDER_TRANSITIONS = {
  pending: ["processing", "cancelled"], processing: ["shipped", "cancelled"],
  shipped: ["delivered"], delivered: [], cancelled: [],
};
const canTransitionOrder = (from, to) => from === to || Boolean(ORDER_TRANSITIONS[from]?.includes(to));

const cancelInUnit = async (order, reason, unit, options = {}) => {
  const { session, compensate } = unit;
  if (order.status === "cancelled" && order.stockRestored) {
    await syncInvoicePayment(order, session);
    return order;
  }
  if (order.isPaid || order.paymentStatus === "review") throw httpError(409, "This payment needs to be resolved before cancellation");
  if (!["pending", "processing"].includes(order.status)) throw httpError(409, "Only pending or processing unpaid orders can be cancelled");
  for (const item of order.items) await restoreItem(item, unit, Boolean(item.variantId));
  const previous = {
    status: order.status, paymentStatus: order.paymentStatus, stockRestored: order.stockRestored || false,
    cancelledAt: order.cancelledAt || null, cancelReason: order.cancelReason || "",
    ...(options.expiredAt ? { reservationExpiredAt: order.reservationExpiredAt || null } : {}),
  };
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, isPaid: false, status: order.status, stockRestored: { $ne: true } },
    { $set: { stockRestored: true, status: "cancelled", paymentStatus: "cancelled", cancelledAt: new Date(), cancelReason: cleanText(reason, 300) || "Cancelled by administrator", ...(options.expiredAt ? { reservationExpiredAt: options.expiredAt } : {}) } },
    writeOptions(session, { new: true })
  );
  if (!updated) throw httpError(409, "Order changed while cancelling. Please refresh it.");
  compensate(async () => {
    await Order.updateOne({ _id: order._id }, { $set: previous });
    await syncInvoicePayment({ ...order.toObject(), ...previous });
  });
  await syncInvoicePayment(updated, session, unit, previous);
  return updated;
};

const cancelOrderAndRestoreStock = (order, reason = "") => withOperationLock("order:" + order._id, () => withDatabaseUnit(async (unit) => {
  const fresh = await querySession(Order.findById(order._id), unit.session);
  if (!fresh) throw httpError(404, "Order not found");
  return cancelInUnit(fresh, reason, unit);
}));

const updateOrderWorkflow = (id, body, actor = null) => withOperationLock("order:" + id, () => withDatabaseUnit(async (unit) => {
  const { session, compensate } = unit;
  const order = await querySession(Order.findById(id), session);
  if (!order) throw httpError(404, "Order not found");
  const input = body.shipment ? normalizeShipment(body.shipment) : undefined;
  const eventStatus = input && { shipped: "shipped", in_transit: "shipped", out_for_delivery: "shipped", delivery_attempted: "shipped", delivered: "delivered" }[input.event];
  const requestedStatus = eventStatus || body.status || order.status;
  if (hasBlockingOperation(order)) throw httpError(409, "Resolve the cancellation, return or refund before changing fulfillment or cash payment");
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
  const shipping = await shipmentFields(order, requestedStatus, input, unit, actor);
  if (shipping.replay) return order;
  const previous = { status: order.status, isPaid: order.isPaid, paymentStatus: order.paymentStatus, paidAt: order.paidAt || null, shipment: order.shipment?.toObject ? order.shipment.toObject() : order.shipment || {} };
  const fields = { status: requestedStatus, ...(shipping.shipment ? { shipment: shipping.shipment } : {}) };
  if (body.isPaid === true || (requestedStatus === "delivered" && order.paymentMethod === "cod")) {
    Object.assign(fields, { isPaid: true, paymentStatus: "paid", paidAt: order.paidAt || new Date() });
  }
  const updated = await Order.findOneAndUpdate({ _id: id, status: order.status }, { $set: fields }, writeOptions(session, { new: true }));
  if (!updated) throw httpError(409, "Order changed. Please refresh it.");
  compensate(async () => {
    await Order.updateOne({ _id: id }, { $set: previous });
    await syncInvoicePayment({ ...order.toObject(), ...previous });
  });
  await syncInvoicePayment(updated, session, unit, previous);
  if (shipping.record && !["shipped", "delivered"].includes(shipping.record.event) && updated.status === "shipped") await require("./notificationService").queueMessage(updated, "tracking", String(shipping.record._id), unit, [shipping.record.location, shipping.record.note].filter(Boolean).join(" — "));
  return updated;
}));

module.exports = { cancelInUnit, calculateTotals, canTransitionOrder, cancelOrderAndRestoreStock, createOrderFromCart, normalizeCheckoutKey, normalizeShippingAddress, updateOrderWorkflow };

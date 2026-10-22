const { orderView } = require("../services/orderView");
const { pagination } = require("../utils/validation");
const Order = require("../models/Order");
const { syncInvoicePayment } = require("../services/invoiceService");
const {
  updateOrderWorkflow,
  createOrderFromCart,
} = require("../services/orderService");

const createOrder = async (req, res, next) => {
  try {
    if (req.body.paymentMethod && req.body.paymentMethod !== "cod") {
      return res.status(400).json({
        message: "Use the SSLCOMMERZ payment endpoint for online checkout",
      });
    }
    const result = await createOrderFromCart({
      user: req.user,
      shippingAddress: req.body.shippingAddress,
      paymentMethod: "cod",
      checkoutKey: req.body.checkoutKey, couponCode: req.body.couponCode, expectedTotals: req.body.expectedTotals,
    });
    res.status(result.replayed ? 200 : 201).json({
      ...orderView(result.order),
      invoiceNumber: result.invoice.invoiceNumber,
    });
  } catch (error) {
    next(error);
  }
};

const getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders.map(orderView));
  } catch (error) {
    next(error);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) return res.status(404).json({ message: "Order not found" });
    const ownerId = order.user?._id || order.user;
    const isOwner = ownerId && ownerId.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to view this order" });
    }
    res.json(orderView(order, { includeInternal: req.user.role === "admin" }));
  } catch (error) {
    next(error);
  }
};

const getAllOrders = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    const { page, limit } = pagination(req.query);
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Order.countDocuments(filter),
    ]);
    res.json({ orders: orders.map((order) => orderView(order, { includeInternal: true })), total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (error) {
    next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try { res.json(await updateOrderWorkflow(req.params.id, req.body, req.user)); }
  catch (error) { next(error); }
};

module.exports = { createOrder, getAllOrders, getMyOrders, getOrder, updateOrderStatus };

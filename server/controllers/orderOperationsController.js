const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Refund = require("../models/Refund");
const OrderRequest = require("../models/OrderRequest");
const OrderEvent = require("../models/OrderEvent");
const { pagination } = require("../utils/validation");
const httpError = require("../utils/httpError");
const { ownedOrder } = require("../services/orderOperationStore");
const requests = require("../services/orderRequestService");
const refunds = require("../services/refundService");
const { reviewOrder } = require("../services/paymentReviewService");
const { orderView } = require("../services/orderView");
const handle = (fn, status = 200) => async (req, res, next) => { try { res.status(status).json(await fn(req)); } catch (error) { next(error); } };
const customerCase = (item) => ({ _id: item._id, type: item.type, status: item.status, reason: item.reason, decisionMessage: item.decisionMessage || "", refundAmount: item.refundAmount || 0, restocked: Boolean(item.restocked), createdAt: item.createdAt, decidedAt: item.decidedAt, receivedAt: item.receivedAt });
const customerRefund = (item) => ({ _id: item._id, gateway: item.gateway, scope: item.scope, status: item.status, amount: item.amount, currency: item.currency, createdAt: item.createdAt, completedAt: item.completedAt });
const getCustomerOperations = handle(async (req) => {
  const order = await ownedOrder(req.params.id, req.user);
  const [cases, records] = await Promise.all([OrderRequest.find({ order: order._id }).sort({ createdAt: -1 }), Refund.find({ order: order._id }).sort({ createdAt: -1 })]);
  return { order: orderView(order), requests: cases.map(customerCase), refunds: records.map(customerRefund) };
});
const createCustomerRequest = handle(async (req) => customerCase(await requests.createRequest({ orderId: req.params.id, user: req.user, body: req.body })), 201);
const listAdminOperations = handle(async (req) => {
  const mode = req.query.mode || "requests";
  if (!["requests", "reviews", "refunds"].includes(mode)) throw httpError(400, "Choose requests, reviews or refunds");
  const { page, limit } = pagination(req.query);
  const filter = {};
  let Model = OrderRequest;
  if (mode === "reviews") { Model = Order; filter.paymentStatus = "review"; }
  if (mode === "refunds") Model = Refund;
  if (req.query.status && mode !== "reviews") {
    const allowed = mode === "requests" ? ["requested", "approved", "rejected", "received", "completed"] : ["awaiting_return", "queued", "submitting", "pending", "unknown", "succeeded", "failed"];
    if (!allowed.includes(req.query.status)) throw httpError(400, "Invalid operation status");
    filter.status = req.query.status;
  }
  if (req.query.type && mode === "requests") {
    if (!["cancellation", "return"].includes(req.query.type)) throw httpError(400, "Invalid request type");
    filter.type = req.query.type;
  }
  const query = Model.find(filter).populate("user", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
  if (mode !== "reviews") query.populate("order", "totalAmount paymentStatus status refundStatus");
  const [items, total] = await Promise.all([query, Model.countDocuments(filter)]);
  return { mode, items, total, page, pages: Math.ceil(total / limit) || 1 };
});
const getAdminOrderOperations = handle(async (req) => {
  const order = await ownedOrder(req.params.id, req.user, null, "payments");
  const [payments, cases, records, events] = await Promise.all([
    Payment.find({ order: order._id }).sort({ createdAt: 1 }), OrderRequest.find({ order: order._id }).sort({ createdAt: -1 }),
    Refund.find({ order: order._id }).sort({ createdAt: -1 }), OrderEvent.find({ order: order._id }).populate("actor", "name email").sort({ createdAt: -1 }).limit(200),
  ]);
  return { order: orderView(order, { includeInternal: true }), payments: payments.map((p) => ({ _id: p._id, gateway: p.gateway, channel: p.channel, transactionId: p.transactionId, validationId: p.validationId || "", bankTransactionId: p.bankTransactionId || "", duplicateValidationIds: [...(p.duplicateValidationIds || [])], amount: p.amount, currency: p.currency, status: p.status, riskLevel: p.riskLevel, failureReason: p.failureReason, paidAt: p.paidAt, createdAt: p.createdAt })), requests: cases, refunds: records, events };
});
module.exports = {
  getCustomerOperations, createCustomerRequest, listAdminOperations, getAdminOrderOperations,
  decideRequest: handle((req) => requests.decideRequest({ requestId: req.params.id, user: req.user, body: req.body })),
  receiveReturn: handle((req) => requests.receiveReturn({ requestId: req.params.id, user: req.user, body: req.body })),
  reviewOrder: handle((req) => reviewOrder({ orderId: req.params.id, user: req.user, body: req.body })),
  requestRefund: handle((req) => refunds.requestRefund({ orderId: req.params.id, user: req.user, body: req.body }), 202),
  confirmRefund: handle((req) => refunds.confirmManualRefund({ refundId: req.params.id, user: req.user, body: req.body })),
  reconcileRefund: handle((req) => refunds.reconcileRefund({ refundId: req.params.id, user: req.user, body: req.body })),
};

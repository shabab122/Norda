const Order = require("../models/Order");
const OrderRequest = require("../models/OrderRequest");
const Refund = require("../models/Refund");
const httpError = require("../utils/httpError");
const { withOperationLock } = require("./operationLock");
const { withDatabaseUnit, insertDocument, querySession } = require("./databaseUnit");
const { objectId, noteText, requestKey, patch, patchOrder, audit, ownedOrder, restoreStock, cancelForOperations, moneyCents } = require("./orderOperationStore");
const { refundSource } = require("./verifiedPayments");
const { sourceRefunds, sumRefunds, queueRefundInUnit, processRefund } = require("./refundService");
const stateField = (type) => type === "cancellation" ? "cancellationStatus" : "returnStatus";
const createRequest = async ({ orderId, user, body }) => {
  objectId(orderId); const key = requestKey(body.requestKey), reason = noteText(body.reason);
  if (!["cancellation", "return"].includes(body.type)) throw httpError(400, "Choose cancellation or return");
  return withOperationLock("order:" + orderId, () => withDatabaseUnit(async (unit) => {
    const order = await ownedOrder(orderId, user, unit.session);
    const replay = await querySession(OrderRequest.findOne({ user: order.user, requestKey: key }), unit.session);
    if (replay) {
      if (String(replay.order) !== String(orderId) || replay.type !== body.type || replay.reason !== reason) throw httpError(409, "This request key was already used for different details");
      return replay;
    }
    if (["pending", "unknown", "partially_refunded", "refunded"].includes(order.refundStatus)) throw httpError(409, "A refund is already active or recorded for this order");
    if (body.type === "cancellation" && !["pending", "processing"].includes(order.status)) throw httpError(409, "Cancellation requests are available only before shipment");
    if (body.type === "return" && (order.status !== "delivered" || !order.isPaid)) throw httpError(409, "A return can be requested after a paid order is delivered");
    if (body.type === "return") {
      await require("./itemReturnPolicy").requireEligible(order, "return", unit.session);
      if (await querySession(require("../models/ItemReturnCase").findOne({ order: order._id, status: { $ne: "rejected" } }), unit.session)) throw httpError(409, "Item-level returns or exchanges already exist for this order");
    }
    const history = await querySession(OrderRequest.find({ order: orderId, type: body.type }), unit.session);
    if (history.some((item) => item.status !== "rejected")) throw httpError(409, "This order already has an active or completed request of this type");
    if (history.length >= 3) throw httpError(409, "Please contact the store after three requests of this type");
    const request = await insertDocument(OrderRequest, { order: orderId, user: order.user, type: body.type, requestKey: key, reason, status: "requested", refundAmount: order.isPaid ? order.totalAmount : 0, restocked: false }, unit.session);
    unit.compensate(() => OrderRequest.deleteOne({ _id: request._id }));
    await patchOrder(order, { [stateField(body.type)]: "requested" }, unit);
    await audit(orderId, user, body.type + "_requested", reason, unit, { request: request._id });
    await require("./notificationService").queueOperationMessage(order, request, "request", unit);
    return request;
  }));
};
const decideRequest = async ({ requestId, user, body }) => {
  objectId(requestId); const note = noteText(body.note);
  if (!["approve", "reject"].includes(body.decision)) throw httpError(400, "Choose approve or reject");
  const reference = await OrderRequest.findById(requestId); if (!reference) throw httpError(404, "Request not found");
  const result = await withOperationLock("order:" + reference.order, async () => {
    const request = await OrderRequest.findById(requestId);
    if (request.status !== "requested") {
      if ((body.decision === "reject" && request.status === "rejected") || (body.decision === "approve" && ["approved", "received", "completed"].includes(request.status))) return request;
      throw httpError(409, "This request already has a different decision");
    }
    let order = await Order.findById(request.order);
    if (!order) throw httpError(404, "Order not found");
    if (body.decision === "approve" && request.type === "cancellation" && !["pending", "processing", "cancelled"].includes(order.status)) throw httpError(409, "The order was already shipped; cancellation cannot be approved");
    if (body.decision === "approve" && request.type === "return" && order.status !== "delivered") throw httpError(409, "Only delivered orders can be approved for return");
    const source = body.decision === "approve" && request.type === "cancellation" && (order.isPaid || order.paymentStatus === "review") ? await refundSource(order) : null;
    const remaining = source ? moneyCents(source.amount) - sumRefunds((await sourceRefunds(order._id, source)).filter((row) => row.status !== "failed")) : 0;
    return withDatabaseUnit(async (unit) => {
      order = await querySession(Order.findById(request.order), unit.session);
      let status = body.decision === "reject" ? "rejected" : "approved";
      if (body.decision === "approve" && request.type === "cancellation") {
        order = await cancelForOperations(order, "Customer cancellation approved: " + request.reason, unit);
        if (!source || (remaining <= 0 && order.refundStatus === "refunded")) status = "completed";
      }
      const updated = await patch(OrderRequest, request, { status, decisionMessage: note, decidedBy: user._id, decidedAt: new Date(), refundAmount: source ? source.amount : request.type === "return" ? order.totalAmount : 0 }, unit);
      order = await patchOrder(order, { [stateField(request.type)]: status }, unit);
      await audit(order._id, user, request.type + "_" + body.decision, note, unit, { request: request._id });
      if (source && remaining > 0) await queueRefundInUnit({ order, source, amount: remaining, key: "cancel-" + request._id, reason: note, actor: user }, unit);
      await require("./notificationService").queueOperationMessage(order, updated, "request", unit);
      return updated;
    });
  });
  const queued = await Refund.find({ order: reference.order, requestKey: "cancel-" + requestId });
  for (const item of queued) await processRefund(item._id, user).catch(() => {});
  return OrderRequest.findById(result._id);
};
const receiveReturn = async ({ requestId, user, body }) => {
  objectId(requestId); const note = noteText(body.note);
  if (typeof body.restock !== "boolean" || body.received !== true) throw httpError(400, "Confirm all returned items were received and choose whether they can be restocked");
  const reference = await OrderRequest.findById(requestId); if (!reference) throw httpError(404, "Request not found");
  const result = await withOperationLock("order:" + reference.order, async () => {
    const request = await OrderRequest.findById(requestId);
    if (request.type !== "return") throw httpError(409, "This request is not a return");
    if (["received", "completed"].includes(request.status)) {
      if (request.restocked !== body.restock) throw httpError(409, "This return was already received with a different stock decision");
      return request;
    }
    if (request.status !== "approved") throw httpError(409, "Approve the return before receiving its items");
    let order = await Order.findById(request.order);
    if (!order || order.status !== "delivered") throw httpError(409, "The delivered order is unavailable for return");
    const source = await refundSource(order);
    const remaining = moneyCents(source.amount) - sumRefunds((await sourceRefunds(order._id, source)).filter((row) => row.status !== "failed"));
    return withDatabaseUnit(async (unit) => {
      order = await querySession(Order.findById(request.order), unit.session);
      if (order.returnStockRestored || order.stockRestored) throw httpError(409, "This order's inventory was already restored");
      if (body.restock) await restoreStock(order, unit);
      const updated = await patch(OrderRequest, request, { status: "received", restocked: body.restock, receivedAt: new Date(), receivedBy: user._id, decisionMessage: note, refundAmount: source.amount }, unit);
      order = await patchOrder(order, { returnStatus: "received", returnStockRestored: body.restock }, unit);
      const Pickup = require("../models/ReturnPickup");
      for (const pickup of await querySession(Pickup.find({ orderRequest: request._id, status: { $nin: ["received", "cancelled", "rejected"] } }), unit.session)) await patch(Pickup, pickup, { status: "received", history: [...(pickup.history.toObject?.() || pickup.history), { key: "whole-receipt-" + request._id, status: "received", note, at: new Date(), actor: user._id }] }, unit);
      await audit(order._id, user, "return_received", note, unit, { request: request._id });
      if (remaining > 0) await queueRefundInUnit({ order, source, amount: remaining, key: "return-" + request._id, reason: note, actor: user }, unit);
      await require("./notificationService").queueOperationMessage(order, updated, "request", unit);
      return updated;
    });
  });
  const queued = await Refund.find({ order: reference.order, requestKey: "return-" + requestId });
  for (const item of queued) await processRefund(item._id, user).catch(() => {});
  return OrderRequest.findById(result._id);
};
module.exports = { createRequest, decideRequest, receiveReturn };

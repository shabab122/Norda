const mongoose = require("mongoose");
const Order = require("../models/Order");
const OrderEvent = require("../models/OrderEvent");
const httpError = require("../utils/httpError");
const { querySession, insertDocument, writeOptions } = require("./databaseUnit");
const { syncInvoicePayment } = require("./invoiceService");
const objectId = (value) => { if (!mongoose.isObjectIdOrHexString(value)) throw httpError(400, "Invalid resource identifier"); return value; };
const noteText = (value) => { if (typeof value !== "string" || value.trim().length < 5 || value.trim().length > 1000) throw httpError(400, "Please provide a reason or note of 5 to 1000 characters"); return value.trim(); };
const requestKey = (value) => { if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{12,80}$/.test(value)) throw httpError(400, "A valid unique request key is required"); return value; };
const cents = (value) => {
  if (!["string", "number"].includes(typeof value) || value === "" || !/^\d+(\.\d{1,2})?$/.test(String(value))) throw httpError(400, "Use a positive amount with at most two decimal places");
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result) || result <= 0) throw httpError(400, "Refund amount is outside the supported range");
  return result;
};
const moneyCents = (value) => Math.round(Number(value || 0) * 100);
const patch = async (Model, document, fields, unit) => {
  const original = document.toObject ? document.toObject() : document;
  const previous = {}, absent = {};
  for (const field of Object.keys(fields)) { if (original[field] === undefined) absent[field] = 1; else previous[field] = original[field]; }
  const updated = await Model.findOneAndUpdate({ _id: document._id }, { $set: fields }, writeOptions(unit.session, { new: true }));
  if (!updated) throw httpError(409, "The record changed. Please refresh and try again.");
  unit.compensate(() => Model.updateOne({ _id: document._id }, { ...(Object.keys(previous).length ? { $set: previous } : {}), ...(Object.keys(absent).length ? { $unset: absent } : {}) }));
  return updated;
};
const patchOrder = async (order, fields, unit) => {
  const updated = await patch(Order, order, fields, unit);
  unit.compensate(() => syncInvoicePayment(order));
  const invoice = await syncInvoicePayment(updated, unit.session, unit, order);
  if (!invoice) throw httpError(409, "The invoice needs store review before this operation");
  return updated;
};
const audit = async (orderId, actor, action, note, unit, refs = {}) => {
  const event = await insertDocument(OrderEvent, { order: orderId, actor: actor?._id, actorRole: ["admin", "staff"].includes(actor?.role) ? actor.role : actor ? "user" : "system", action, note, ...refs }, unit.session);
  unit.compensate(() => OrderEvent.deleteOne({ _id: event._id }));
  return event;
};
const ownedOrder = async (id, user, session, scope) => {
  objectId(id); const order = await querySession(Order.findById(id), session);
  if (!order) throw httpError(404, "Order not found");
  if (user.role !== "admin" && !(scope && require("../utils/permissions").hasPermission(user, scope)) && String(order.user) !== String(user._id)) throw httpError(403, "Not authorized to access this order");
  return order;
};
const restoreStock = async (order, unit) => {
  for (const item of order.items) await require("./inventoryService").restoreItem(item, unit);
};
const cancelForOperations = async (order, reason, unit) => {
  await require("./courierService").assertNoActiveBooking(order._id, unit.session);
  if (!["pending", "processing", "cancelled"].includes(order.status)) throw httpError(409, "A shipped or delivered order cannot be cancelled");
  if (!order.stockRestored) await restoreStock(order, unit);
  return patchOrder(order, { status: "cancelled", stockRestored: true, cancelledAt: order.cancelledAt || new Date(), cancelReason: reason.slice(0, 300), reservationExpiredAt: null,
    paymentStatus: order.isPaid || order.paymentStatus === "review" ? order.paymentStatus : "cancelled" }, unit);
};
const hasBlockingOperation = (order) => ["requested", "approved", "completed"].includes(order.cancellationStatus) || ["approved", "received", "completed"].includes(order.returnStatus) || ["pending", "unknown", "partially_refunded", "refunded"].includes(order.refundStatus);
module.exports = { objectId, noteText, requestKey, cents, moneyCents, patch, patchOrder, audit, ownedOrder, restoreStock, cancelForOperations, hasBlockingOperation };

const ShipmentEvent = require("../models/ShipmentEvent");
const OrderNotification = require("../models/OrderNotification");
const { ownedOrder, objectId } = require("../services/orderOperationStore");
const { updateOrderWorkflow } = require("../services/orderService");
const { normalizeShipment } = require("../services/shipmentService");
const { retryNotification } = require("../services/notificationService");
const { pagination } = require("../utils/validation");
const mail = require("../services/mailService");
const httpError = require("../utils/httpError");
const handle = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (error) { next(error); } };
const getTracking = handle(async (req) => {
  const order = await ownedOrder(req.params.id, req.user, null, "orders"), { page, limit } = pagination(req.query, 20);
  const filter = { order: order._id };
  const [events, total] = await Promise.all([ShipmentEvent.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), ShipmentEvent.countDocuments(filter)]);
  return { order: { _id: order._id, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod, isPaid: order.isPaid, cancellationStatus: order.cancellationStatus, returnStatus: order.returnStatus, refundStatus: order.refundStatus }, shipment: order.shipment || {}, events: events.map((e) => ({ _id: e._id, ...(req.user.role === "admin" ? { requestKey: e.requestKey } : {}), event: e.event, courierName: e.courierName, trackingNumber: e.trackingNumber, trackingUrl: e.trackingUrl, location: e.location, note: e.note, createdAt: e.createdAt })), page, pages: Math.ceil(total / limit) || 1, total };
});
const updateShipment = handle(async (req) => {
  objectId(req.params.id);
  const shipment = normalizeShipment(req.body);
  const order = await updateOrderWorkflow(req.params.id, { shipment }, req.user);
  return { orderId: order._id, status: order.status, shipment: order.shipment || {} };
});
const listNotifications = handle(async (req) => {
  const filter = {}, { page, limit } = pagination(req.query, 20);
  if (req.query.status) { if (!["held", "queued", "sending", "sent", "failed", "suppressed"].includes(req.query.status)) throw httpError(400, "Invalid email status"); filter.status = req.query.status; }
  if (req.query.orderId) { objectId(req.query.orderId); filter.order = req.query.orderId; }
  const [rows, total] = await Promise.all([OrderNotification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), OrderNotification.countDocuments(filter)]);
  let transport = "needs_configuration"; try { transport = mail.mailConfiguration().transport; } catch { /* Credentials are never returned to the browser. */ }
  return { items: rows.map((r) => ({ _id: r._id, order: r.order, topic: r.topic, to: r.to, subject: r.subject, status: r.status, attempts: r.attempts, nextAttemptAt: r.nextAttemptAt, sentAt: r.sentAt, transport: r.transport, lastError: r.lastError, deliveryStatus: r.deliveryStatus || "unknown", deliveryReason: r.deliveryReason || "", deliveryUpdatedAt: r.deliveryUpdatedAt, messageId: r.messageId, createdAt: r.createdAt })), transport, total, page, pages: Math.ceil(total / limit) || 1 };
});
const retryEmail = handle(async (req) => { objectId(req.params.id); const row = await retryNotification(req.params.id); return { _id: row._id, status: row.status }; });
module.exports = { getTracking, updateShipment, listNotifications, retryEmail };

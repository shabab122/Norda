const crypto = require("node:crypto");
const OrderNotification = require("../models/OrderNotification");
const Event = require("../models/NotificationDeliveryEvent");
const { withOperationLock } = require("./operationLock");
const { withDatabaseUnit, insertDocument, querySession } = require("./databaseUnit");
const { objectId, patch } = require("./orderOperationStore");
const httpError = require("../utils/httpError");
function verifyWebhook(req) {
  const secret = process.env.MAIL_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) throw httpError(503, "Delivery webhook is not configured");
  const timestamp = req.headers["x-norda-timestamp"], signature = req.headers["x-norda-signature"];
  if (!/^\d{10}$/.test(timestamp || "") || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/i.test(signature || "") || !req.rawMailBody) throw httpError(401, "Invalid delivery event signature");
  const expected = crypto.createHmac("sha256", secret).update(timestamp + ".").update(req.rawMailBody).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw httpError(401, "Invalid delivery event signature");
}
async function recordDelivery(body, actor = null) {
  const provider = actor ? "manual" : (typeof body.provider === "string" ? body.provider.trim() : "");
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(provider) || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(body.eventId || "") || !["delivered", "bounced", "complained"].includes(body.kind)) throw httpError(400, "Provide provider, unique event ID and delivered/bounced/complained outcome");
  const occurredAt = new Date(body.occurredAt || ""), reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!Number.isFinite(+occurredAt) || +occurredAt > Date.now() + 300000 || reason.length > 500 || /[\u0000-\u001f]/.test(reason)) throw httpError(400, "Provide a valid delivery time and reason");
  if (actor && (body.verified !== true || reason.length < 5)) throw httpError(400, "Confirm that this outcome was checked with your email provider and add a reason");
  let row;
  if (body.notificationId) { objectId(body.notificationId); row = await OrderNotification.findById(body.notificationId); }
  else if (typeof body.messageId === "string" && body.messageId.length <= 250) row = await OrderNotification.findOne({ messageId: body.messageId });
  if (!row) throw httpError(404, "Email notification not found");
  if (row.transport === "file" || !row.messageId) throw httpError(409, "A local preview has no provider delivery outcome");
  return withOperationLock("email-delivery:" + row._id, () => withDatabaseUnit(async (unit) => {
    const replay = await querySession(Event.findOne({ provider, eventId: body.eventId }), unit.session);
    if (replay) {
      if (String(replay.notification) !== String(row._id) || replay.kind !== body.kind || +new Date(replay.occurredAt) !== +occurredAt || replay.reason !== reason) throw httpError(409, "This delivery event ID belongs to different details");
      return { eventId: replay._id, replayed: true };
    }
    const current = await querySession(OrderNotification.findById(row._id), unit.session);
    const event = await insertDocument(Event, { notification: row._id, provider, eventId: body.eventId, kind: body.kind, occurredAt, reason, actor: actor?._id }, unit.session);
    unit.compensate(() => Event.deleteOne({ _id: event._id }));
    const rank = { unknown: 0, accepted: 1, delivered: 2, bounced: 3, complained: 4 };
    if ((rank[body.kind] || 0) >= (rank[current.deliveryStatus] || 0)) await patch(OrderNotification, current, { deliveryStatus: body.kind, deliveryReason: reason, deliveryUpdatedAt: occurredAt }, unit);
    return { eventId: event._id, replayed: false };
  }));
}
module.exports = { verifyWebhook, recordDelivery };

const ShipmentEvent = require("../models/ShipmentEvent");
const { cleanText } = require("../utils/validation");
const httpError = require("../utils/httpError");
const { insertDocument, querySession } = require("./databaseUnit");

const normalizeShipment = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "Invalid shipment details");
  if (typeof body.requestKey !== "string" || !/^[a-zA-Z0-9_-]{12,80}$/.test(body.requestKey)) throw httpError(400, "A unique shipment request key is required");
  const event = body.event || "details_updated";
  if (!["details_updated", "shipped", "in_transit", "out_for_delivery", "delivery_attempted", "delivered"].includes(event)) throw httpError(400, "Choose a valid delivery event");
  const fields = { requestKey: body.requestKey, event };
  for (const [name, limit] of [["courierName", 80], ["trackingNumber", 100], ["location", 120], ["note", 500]]) {
    if (body[name] !== undefined) { if (typeof body[name] !== "string" || body[name].trim().length > limit) throw httpError(400, "Invalid " + name); fields[name] = cleanText(body[name], limit); }
  }
  if (body.trackingUrl !== undefined) {
    if (typeof body.trackingUrl !== "string" || body.trackingUrl.length > 500) throw httpError(400, "Invalid tracking URL");
    fields.trackingUrl = body.trackingUrl.trim();
    if (fields.trackingUrl) { let url; try { url = new URL(fields.trackingUrl); } catch { throw httpError(400, "Use a valid HTTPS courier tracking URL"); } if (url.protocol !== "https:" || url.username || url.password) throw httpError(400, "Use a valid HTTPS courier tracking URL"); fields.trackingUrl = url.href; }
  }
  return fields;
};
const shipmentFields = async (order, requestedStatus, input, unit, actor) => {
  const current = order.shipment?.toObject ? order.shipment.toObject() : { ...(order.shipment || {}) };
  const event = input?.event || (requestedStatus !== order.status && ["shipped", "delivered"].includes(requestedStatus) ? requestedStatus : "");
  if (!event) return {};
  const key = input?.requestKey || "workflow-" + event;
  const replay = await querySession(ShipmentEvent.findOne({ order: order._id, requestKey: key }), unit.session);
  if (replay) {
    if (input && ["event", "courierName", "trackingNumber", "trackingUrl", "location", "note"].some((key) => input[key] !== undefined && input[key] !== replay[key])) throw httpError(409, "This shipment key was used for a different update");
    return { replay };
  }
  if (input && ["cancelled", "delivered"].includes(order.status)) throw httpError(409, "Shipment changes are closed for this order");
  if (input && event !== "details_updated" && requestedStatus !== "shipped" && requestedStatus !== "delivered") throw httpError(409, "Dispatch the order before adding delivery events");
  const rank = { shipped: 1, in_transit: 2, out_for_delivery: 3, delivery_attempted: 3, delivered: 4 };
  if (event !== "details_updated" && (rank[event] || 0) < (rank[current.state] || 0)) throw httpError(409, "Shipment progress cannot move backwards");
  const shipment = { ...current };
  for (const name of ["courierName", "trackingNumber", "trackingUrl"]) if (input?.[name] !== undefined) shipment[name] = input[name];
  if (input && (event !== "details_updated" || order.status === "shipped") && (!shipment.courierName || !shipment.trackingNumber)) throw httpError(400, "Courier name and tracking number are required before dispatch");
  if (Boolean(shipment.courierName) !== Boolean(shipment.trackingNumber)) throw httpError(400, "Provide both courier name and tracking number");
  if (event !== "details_updated") shipment.state = event;
  shipment.lastUpdatedAt = new Date();
  if (requestedStatus === "shipped") shipment.shippedAt = current.shippedAt || new Date();
  if (event === "delivered") shipment.deliveredAt = current.deliveredAt || new Date();
  const record = await insertDocument(ShipmentEvent, { order: order._id, requestKey: key, event, courierName: shipment.courierName, trackingNumber: shipment.trackingNumber, trackingUrl: shipment.trackingUrl, location: input?.location || "", note: input?.note || "", actor: actor?._id }, unit.session);
  unit.compensate(() => ShipmentEvent.deleteOne({ _id: record._id }));
  return { shipment, record };
};
module.exports = { normalizeShipment, shipmentFields };

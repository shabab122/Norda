const crypto = require("node:crypto");
const Booking = require("../models/CourierBooking");
const Event = require("../models/CourierEvent");
const Order = require("../models/Order");
const User = require("../models/User");
const carrier = require("./ecourierService");
const { withOperationLock } = require("./operationLock");
const { withDatabaseUnit, querySession, insertDocument } = require("./databaseUnit");
const { ownedOrder, objectId, requestKey, noteText, patch, audit, hasBlockingOperation } = require("./orderOperationStore");
const httpError = require("../utils/httpError");
const hash = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const trackingId = (v) => typeof v === "string" && /^(?:ECR|BL)[a-zA-Z0-9]{8,70}$/.test(v);
function text(v, max, name) { if (typeof v !== "string" || !v.trim() || v.trim().length > max || /[\u0000-\u001f]/.test(v)) throw httpError(400, "Provide valid " + name + " (up to " + max + " characters)"); return v.trim(); }
function payloadFor(order, user, input, reference) {
  if (order.status !== "processing" || hasBlockingOperation(order) || order.paymentMethod === "demo" || (order.paymentMethod !== "cod" && (!order.isPaid || order.paymentStatus !== "paid"))) throw httpError(409, "Only eligible processing orders can be booked; simulations and unresolved payments/requests are excluded");
  const a = order.shippingAddress || {}, amount = order.isPaid ? 0 : order.totalAmount;
  if (!Number.isSafeInteger(amount) || amount < 0) throw httpError(409, "This carrier documents whole-BDT collection amounts. Reconcile fractional COD totals instead of rounding or overcharging.");
  const mobile = String(a.phone || "").replace(/[\s()-]/g, "").replace(/^\+?88/, ""); if (!/^01\d{9}$/.test(mobile)) throw httpError(400, "eCourier requires an 11-digit Bangladesh mobile number");
  const payment = order.isPaid ? process.env.ECOURIER_PREPAID_METHOD : "COD";
  if (order.isPaid && (process.env.ECOURIER_PREPAID_CONFIRMED !== "true" || !["MPAY", "CCRD"].includes(payment) || !process.env.ECOURIER_PGW_ID)) throw httpError(409, "Ask eCourier to confirm zero-collection prepaid settings and configure the merchant payment mapping before booking a paid order");
  const code = input.packageCode; if (typeof code !== "string" || !/^#[a-zA-Z0-9_-]{1,40}$/.test(code)) throw httpError(400, "Choose an assigned eCourier package");
  return { recipient_name: text(input.recipientName || user.name, 250, "recipient name"), recipient_mobile: mobile, recipient_city: text(input.city || a.city, 40, "delivery city"), recipient_thana: text(input.thana || a.thana, 40, "delivery thana"), recipient_area: text(input.area || a.area, 40, "delivery area"), recipient_address: text(input.address || [a.line1, a.line2].filter(Boolean).join(", "), 40, "carrier address"), recipient_zip: text(a.postCode, 20, "postcode"), package_code: code, product_price: amount, ...(Number.isSafeInteger(order.subtotal - (order.discountAmount || 0)) ? { actual_product_price: order.subtotal - (order.discountAmount || 0) } : {}), payment_method: payment, parcel_type: "BOX", product_id: reference, number_of_item: order.items.reduce((s, i) => s + i.quantity, 0), comments: "NORDA order " + order._id, ...(order.isPaid ? { pgwid: process.env.ECOURIER_PGW_ID, pgwtxn_id: order.paidTransactionId || order.transactionId || "COD-PAID-" + String(order._id).slice(-10) } : {}) };
}
async function eventInUnit(b, key, status, note, kind, unit, occurredAt = new Date(), actor) { const existing = await querySession(Event.findOne({ booking: b._id, key }), unit.session); if (existing) return existing; const e = await insertDocument(Event, { booking: b._id, order: b.order, key, status, note, kind, occurredAt, actor: actor?._id }, unit.session); unit.compensate(() => Event.deleteOne({ _id: e._id })); return e; }
const safeBooking = (b, internal = false) => ({ _id: b._id, order: b.order, provider: b.provider, status: b.status, trackingNumber: b.trackingNumber || "", providerStatus: b.providerStatus || "", exceptionStatus: b.exceptionStatus || "none", exceptionReason: b.exceptionReason || "", resolutionNote: b.resolutionNote || "", lastPolledAt: b.lastPolledAt, bookedAt: b.bookedAt, ...(internal ? { reference: b.reference, package: b.package, providerCharge: b.providerCharge, codCharge: b.codCharge, labelUrl: b.labelUrl || "", lastError: b.lastError || "", payload: b.payload } : {}) });
async function createBooking({ orderId, user, body, automatic = false }) {
  if (await require("../models/FulfillmentParcel").countDocuments({ order: orderId }) > 1) throw httpError(409, "Use individual parcel fulfillment for a split warehouse order");
  objectId(orderId); const key = requestKey(body.requestKey);
  const intentHash = hash(Object.fromEntries(["packageCode", "expectedShippingCharge", "recipientName", "city", "thana", "area", "address"].filter((k) => body[k] !== undefined).map((k) => [k, body[k]])));
  return withOperationLock("order:" + orderId, async () => {
    const order = await ownedOrder(orderId, user, null, "orders"), previous = await Booking.findOne({ order: orderId });
    if (previous) { if (previous.requestKey === key && previous.intentHash === intentHash) return safeBooking(previous, true); throw httpError(409, "This order already has a courier booking. Reconcile or cancel it; do not submit a second parcel."); }
    if (!carrier.configuration().ready) throw httpError(503, "eCourier is not configured; existing manual delivery tracking remains available");
    if (order.shipment?.trackingNumber) throw httpError(409, "This order already has manual tracking. Verify that booking before creating a carrier parcel.");
    const owner = await User.findById(order.user); if (!owner) throw httpError(409, "Order recipient account is missing");
    const reference = "NOR" + crypto.randomBytes(8).toString("hex"), payload = payloadFor(order, owner, body, reference);
    const selected = automatic ? null : (await carrier.packages()).find((p) => p.code === payload.package_code);
    if (!automatic && (!selected || body.expectedShippingCharge !== selected.shippingCharge)) throw httpError(409, "Carrier package or charge changed. Reload the assigned package quote before booking.");
    return withDatabaseUnit(async (unit) => {
      const booking = await insertDocument(Booking, { order: orderId, provider: "ecourier", reference, requestKey: key, intentHash, fingerprint: hash(payload), payload, package: selected || { code: body.packageCode }, status: "queued", exceptionStatus: "none", nextPollAt: new Date(), createdBy: user._id }, unit.session); unit.compensate(() => Booking.deleteOne({ _id: booking._id }));
      await eventInUnit(booking, "queued", "queued", "Carrier booking queued; no parcel pickup has been confirmed.", "booking", unit, new Date(), user); return safeBooking(booking, true);
    });
  });
}
async function assertNoActiveBooking(orderId, session) { const b = await querySession(Booking.findOne({ order: orderId, status: { $nin: ["cancelled", "rejected"] } }), session); if (b) throw httpError(409, "Cancel or reconcile the carrier parcel before cancelling this order or restoring stock"); }
async function activateBooking(b, id, unit) {
  const order = await querySession(Order.findById(b.order), unit.session); if (!order) throw httpError(409, "Booking order is missing");
  const shipment = { ...(order.shipment?.toObject?.() || order.shipment || {}), courierName: "eCourier", trackingNumber: id, trackingUrl: "https://ecourier.com.bd/tracking/", lastUpdatedAt: new Date() };
  if (order.shipment?.trackingNumber && order.shipment.trackingNumber !== id) throw httpError(409, "Order tracking changed; reconcile carrier identity manually");
  await require("./orderOperationStore").patchOrder(order, { shipment }, unit);
  const updated = await patch(Booking, b, { status: "booked", trackingNumber: id, bookedAt: b.bookedAt || new Date(), nextPollAt: new Date(), lastError: "" }, unit);
  await eventInUnit(updated, "booked:" + id, "booked", "Parcel accepted by eCourier; awaiting pickup.", "booking", unit); return updated;
}
async function processBooking(id) {
  objectId(id); const reference = await Booking.findById(id); if (!reference) throw httpError(404, "Courier booking not found");
  return withOperationLock("order:" + reference.order, async () => {
    let b = await Booking.findById(id); if (b.status !== "queued") return b;
    const order = await Order.findById(b.order), owner = order && await User.findById(order.user);
    if (!order || !owner) throw httpError(409, "Booking order is unavailable");
    // Verify the stored immutable request still matches the order and payment.
    const rebuilt = payloadFor(order, owner, { recipientName: b.payload.recipient_name, city: b.payload.recipient_city, thana: b.payload.recipient_thana, area: b.payload.recipient_area, address: b.payload.recipient_address, packageCode: b.payload.package_code }, b.reference);
    if (JSON.stringify(rebuilt) !== JSON.stringify(b.payload)) throw httpError(409, "Order payment or recipient changed before booking");
    if (b.package?.shippingCharge === undefined) { const p = (await carrier.packages()).find((p) => p.code === b.payload.package_code); if (!p) throw httpError(409, "Automatic booking package is unavailable"); b = await Booking.findByIdAndUpdate(id, { $set: { package: p } }, { new: true }); }
    b = await Booking.findByIdAndUpdate(id, { $set: { status: "submitting", submittedAt: new Date() } }, { new: true });
    let data;
    try { data = await carrier.book(b.payload); }
    catch (e) { return Booking.findByIdAndUpdate(id, { $set: { status: e.uncertain ? "unknown" : "rejected", lastError: e.uncertain ? "Booking result is unknown. Reconcile the original merchant reference; no automatic resubmission." : "Carrier rejected the request. Check account/package/address before store review." } }, { new: true }); }
    if (!trackingId(data?.ID) || Number(data.response_code) !== 200) return Booking.findByIdAndUpdate(id, { $set: { status: "unknown", lastError: "Courier returned no matching parcel identity. Reconcile before any action." } }, { new: true });
    try { return await withDatabaseUnit((unit) => activateBooking(b, data.ID, unit)); }
    catch (e) { await Booking.updateOne({ _id: id }, { $set: { status: "unknown", lastError: "Carrier accepted a parcel but local recording failed. Reconcile the same reference." } }); throw e; }
  });
}
function normalizedStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  const normal = { "initiated": "initiated", "initiated api": "initiated", "picked up": "shipped", "in source branch": "in_transit", "in destination branch": "in_transit", "in transit": "in_transit", "on the way to delivery": "out_for_delivery", "delivered": "delivered" }[value];
  return normal || "exception";
}
function trackingRows(data, booking) {
  if (Number(data?.response_code) !== 200 || !Array.isArray(data.query_data)) throw httpError(409, "Carrier has not returned a confirmed matching parcel. No new booking was sent.");
  const matching = data.query_data.filter((r) => r.product_id === booking.reference && (!booking.trackingNumber || r.REFID === booking.trackingNumber));
  if (matching.length !== 1 || !trackingId(matching[0].REFID)) throw httpError(409, "Carrier history is ambiguous or does not match the original merchant reference");
  const row = matching[0]; if (String(row.r_mobile) !== booking.payload.recipient_mobile || Number(row.product_price) !== booking.payload.product_price || !Array.isArray(row.status) || row.status.length > 500) throw httpError(409, "Carrier recipient or collection amount did not match this order");
  return row;
}
async function applyTracking(b, row, unit) {
  let order = await querySession(Order.findById(b.order), unit.session), current = b;
  if (!order) throw httpError(409, "Order no longer exists");
  const history = row.status.map((v) => { if (!Array.isArray(v) || typeof v[0] !== "string" || v[0].length > 100 || typeof v[1] !== "string" || v[1].length > 500 || typeof v[2] !== "string") throw httpError(502, "Invalid carrier history event"); const at = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v[2]) ? v[2].replace(" ", "T") + "+06:00" : v[2]); if (!Number.isFinite(+at) || +at > Date.now() + 300000) throw httpError(502, "Invalid carrier history time"); return { status: v[0], note: v[1].replace(/[\u0000-\u001f]/g, " "), at, key: hash(v), event: normalizedStatus(v[0]) }; }).sort((a, b) => +a.at - +b.at || a.key.localeCompare(b.key));
  for (const e of history) {
    const observed = await querySession(Event.exists({ booking: b._id, key: e.key }), unit.session);
    if (observed && (e.event === "exception" || e.event === "initiated")) continue;
    if (!observed) await eventInUnit(b, e.key, e.status, e.note, e.event === "exception" ? "exception" : "tracking", unit, e.at);
    if (e.event === "exception") { if (current.exceptionKey !== e.key) current = await patch(Booking, current, { exceptionStatus: "open", exceptionReason: e.status + (e.note ? ": " + e.note : ""), exceptionKey: e.key }, unit); continue; }
    if (e.event === "initiated" || ["cancelled", "delivered"].includes(order.status)) continue;
    if (hasBlockingOperation(order) || (order.paymentMethod !== "cod" && order.paymentStatus !== "paid")) { current = await patch(Booking, current, { exceptionStatus: "open", exceptionReason: "Order operation/payment blocks automatic tracking fulfillment." }, unit); continue; }
    const rank = { shipped: 1, in_transit: 2, out_for_delivery: 3, delivery_attempted: 3, delivered: 4 };
    if ((rank[order.shipment?.state] || 0) > (rank[e.event] || 0)) continue;
    if (order.status === "processing" && e.event !== "shipped") order = await require("./orderService").updateOrderInUnit(order._id, { shipment: { requestKey: "courier-dispatch-" + b._id, event: "shipped", courierName: "eCourier", trackingNumber: row.REFID, trackingUrl: "https://ecourier.com.bd/tracking/", note: "Dispatch confirmed by subsequent carrier movement." } }, null, unit);
    order = await require("./orderService").updateOrderInUnit(order._id, { shipment: { requestKey: "courier-" + e.key.slice(0, 40), event: e.event, courierName: "eCourier", trackingNumber: row.REFID, trackingUrl: "https://ecourier.com.bd/tracking/", note: e.note || e.status } }, null, unit);
  }
  const newest = history[history.length - 1];
  current = await patch(Booking, current, { trackingComplete: order.status === "delivered", providerStatus: newest?.status || current.providerStatus || "", providerCharge: carrier.amount(row.shipping_price), codCharge: carrier.amount(row.cod ?? 0), lastPolledAt: new Date(), nextPollAt: new Date(Date.now() + 300000), lastError: "" }, unit);
  return current;
}
async function syncBooking(id) {
  objectId(id); const ref = await Booking.findById(id); if (!ref) throw httpError(404, "Courier booking not found");
  return withOperationLock("order:" + ref.order, async () => {
    let b = await Booking.findById(id);
    if (!["booked", "unknown", "submitting", "cancel_unknown"].includes(b.status)) throw httpError(409, "This booking cannot be reconciled in its current state");
    const row = trackingRows(await carrier.track(b.reference, b.trackingNumber), b);
    return withDatabaseUnit(async (unit) => {
      if (b.status === "cancel_unknown") { const newest = [...row.status].sort((a, b) => String(b[2]).localeCompare(String(a[2])))[0]; if (/^cancel(?:led|ed)$/i.test(newest?.[0] || "")) { b = await patch(Booking, b, { status: "cancelled", providerStatus: newest[0], lastPolledAt: new Date(), lastError: "" }, unit); await eventInUnit(b, "cancel-confirmed", "cancelled", "Carrier cancellation confirmed; order cancellation remains separate.", "cancellation", unit); return b; } throw httpError(409, "Carrier cancellation is still unresolved; stock and the original order were retained"); }
      if (b.status !== "booked") b = await activateBooking(b, row.REFID, unit);
      return applyTracking(b, row, unit);
    });
  });
}
async function cancelBooking(id, user, body) {
  objectId(id); const note = noteText(body.note); if (body.confirmed !== true) throw httpError(400, "Explicitly confirm carrier cancellation"); const ref = await Booking.findById(id); if (!ref) throw httpError(404, "Courier booking not found");
  return withOperationLock("order:" + ref.order, async () => {
    let b = await Booking.findById(id); if (b.status === "cancelled") return safeBooking(b, true);
    if (b.status === "queued" || b.status === "rejected") return withDatabaseUnit(async (unit) => { b = await patch(Booking, b, { status: "cancelled", lastError: "" }, unit); await eventInUnit(b, "cancel-local", "cancelled", note, "cancellation", unit, new Date(), user); return safeBooking(b, true); });
    if (b.status !== "booked") throw httpError(409, "Reconcile the uncertain booking before cancellation");
    const row = trackingRows(await carrier.track(b.reference, b.trackingNumber), b), newest = [...row.status].sort((a, b) => String(b[2]).localeCompare(String(a[2])))[0];
    if (normalizedStatus(newest?.[0]) !== "initiated") throw httpError(409, "The carrier has already moved this parcel. Handle the delivery exception or return with customer care.");
    await Booking.updateOne({ _id: id }, { $set: { status: "cancel_unknown", lastError: "Carrier cancellation in progress; do not cancel the order yet." } });
    let data; try { data = await carrier.cancel(b.trackingNumber, note); } catch { throw httpError(502, "Carrier cancellation result is unknown. Reconcile before restoring order stock."); }
    if (![true, "true"].includes(data.success)) throw httpError(409, "Carrier did not confirm cancellation. Reconcile before restoring stock.");
    return withDatabaseUnit(async (unit) => { b = await querySession(Booking.findById(id), unit.session); b = await patch(Booking, b, { status: "cancelled", providerStatus: "Cancelled", lastError: "" }, unit); await eventInUnit(b, "cancel-confirmed", "cancelled", note, "cancellation", unit, new Date(), user); return safeBooking(b, true); });
  });
}
async function resolveException(id, user, body) { objectId(id); const note = noteText(body.note), ref = await Booking.findById(id); if (!ref) throw httpError(404, "Courier booking not found"); return withOperationLock("order:" + ref.order, () => withDatabaseUnit(async (unit) => { const b = await querySession(Booking.findById(id), unit.session); if (b.exceptionStatus === "resolved" && b.resolutionNote === note) return safeBooking(b, true); if (b.exceptionStatus !== "open") throw httpError(409, "There is no open delivery exception"); const updated = await patch(Booking, b, { exceptionStatus: "resolved", resolutionNote: note }, unit); await eventInUnit(b, "resolution-" + hash({ key: b.exceptionKey, note }), "resolved", note, "resolution", unit, new Date(), user); await audit(b.order, user, "courier_exception_resolved", note, unit); return safeBooking(updated, true); })); }
async function bookingLabel(id) { objectId(id); const b = await Booking.findById(id); if (!b || b.status !== "booked" || !b.trackingNumber) throw httpError(409, "A confirmed booked parcel is required for the provider label"); const labelUrl = await carrier.label(b.trackingNumber); await Booking.updateOne({ _id: id }, { $set: { labelUrl } }); return { labelUrl }; }
async function automaticBookings() { const config = carrier.configuration(); if (!config.auto) return; const orders = await Order.find({ status: "processing", createdAt: { $gte: config.autoAfter } }).sort({ createdAt: 1 }).limit(50); for (const o of orders) if (o.paymentMethod !== "demo" && !await Booking.exists({ order: o._id })) { try { await createBooking({ orderId: o._id, user: { _id: o.user, role: "user" }, body: { requestKey: "auto-" + o._id, packageCode: config.packageCode }, automatic: true }); } catch { await require("./operationsService").recordEvent({ kind: "COURIER_AUTO_NEEDS_REVIEW", summary: "A processing order needs carrier address/package/payment review.", route: "courier:auto", requestId: String(o._id), severity: "warning" }).catch(() => {}); } } }
async function sweepCourier() { if (!carrier.configuration().ready) return; await automaticBookings(); const queued = await Booking.find({ status: "queued" }).sort({ createdAt: 1 }).limit(10); for (const b of queued) try { await processBooking(b._id); } catch { await Booking.updateOne({ _id: b._id, status: "queued" }, { $set: { status: "rejected", lastError: "Booking prerequisites changed. Store review is required before any submission." } }); }
  const rows = await Booking.find({ status: { $in: ["booked", "unknown", "submitting", "cancel_unknown"] }, trackingComplete: { $ne: true }, nextPollAt: { $lte: new Date() } }).sort({ nextPollAt: 1 }).limit(20); for (const b of rows) try { await syncBooking(b._id); } catch { await Booking.updateOne({ _id: b._id }, { $set: { nextPollAt: new Date(Date.now() + 300000), lastError: "Carrier synchronization needs review; no duplicate booking was submitted." } }); }
}
function startCourierWorker() { let running, stopped = false; const tick = () => { if (stopped || running) return; running = require("./maintenanceService").withWriteLease(sweepCourier).catch(() => {}).finally(() => running = null); }; const timer = setInterval(tick, 30000); timer.unref(); tick(); return async () => { stopped = true; clearInterval(timer); if (running) await running; }; }
module.exports = { createBooking, processBooking, syncBooking, cancelBooking, resolveException, bookingLabel, assertNoActiveBooking, normalizedStatus, trackingRows, payloadFor, safeBooking, sweepCourier, startCourierWorker };

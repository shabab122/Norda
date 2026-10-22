const Order = require("../models/Order");
const { nextReservationDeadline, reservationMinutes, sweepSeconds } = require("../config/reservations");
const { querySession, withDatabaseUnit } = require("./databaseUnit");
const { withOperationLock } = require("./operationLock");
const { cancelInUnit } = require("./orderService");

const reservationDeadline = (order) => {
  if (order.paymentMethod === "cod") return null;
  const date = order.reservationExpiresAt || (order.createdAt && nextReservationDeadline(new Date(order.createdAt)));
  return date && Number.isFinite(new Date(date).getTime()) ? new Date(date) : null;
};
const isReservationDue = (order, now = new Date()) => {
  const deadline = reservationDeadline(order);
  return Boolean(deadline && deadline <= now && order.paymentMethod !== "cod" && !order.isPaid &&
    !["paid", "review"].includes(order.paymentStatus) && !order.stockRestored && ["pending", "processing"].includes(order.status));
};
const expireInUnit = async (order, unit, now = new Date()) => isReservationDue(order, now)
  ? cancelInUnit(order, "Online payment reservation expired; stock was released automatically.", unit, { expiredAt: now }) : order;
const expireReservationForOrder = (id, now = new Date()) => withOperationLock("order:" + id, () => withDatabaseUnit(async (unit) => {
  const order = await querySession(Order.findById(id), unit.session);
  return order ? expireInUnit(order, unit, now) : null;
}));
const expireReservations = async ({ now = new Date(), limit = 50 } = {}) => {
  const orders = await Order.find({
    paymentMethod: { $in: ["sslcommerz", "demo"] }, isPaid: false, paymentStatus: { $nin: ["paid", "review"] },
    stockRestored: { $ne: true }, status: { $in: ["pending", "processing"] },
    $or: [{ reservationExpiresAt: { $lte: now } }, { reservationExpiresAt: null, createdAt: { $lte: new Date(now.getTime() - reservationMinutes() * 60000) } }],
  }).sort({ createdAt: 1 }).limit(Math.min(200, Math.max(1, limit)));
  let expired = 0;
  let busy = 0;
  let failed = 0;
  for (const order of orders) {
    try {
      const result = await expireReservationForOrder(order._id, now);
      if (result?.reservationExpiredAt) expired += 1;
    } catch (error) {
      if (error.statusCode === 409) busy += 1;
      else { failed += 1; console.error("Reservation release failed for order " + order._id + ":", error.message); }
    }
  }
  return { checked: orders.length, expired, busy, failed };
};
const startReservationWorker = () => {
  let running = null;
  let stopped = false;
  const tick = () => {
    if (stopped || running) return;
    running = require("./maintenanceService").withWriteLease(expireReservations).catch((error) => console.error("Reservation sweep failed:", error.message)).finally(() => { running = null; });
  };
  const timer = setInterval(tick, sweepSeconds() * 1000);
  timer.unref();
  tick();
  return async () => { stopped = true; clearInterval(timer); if (running) await running; };
};
module.exports = { reservationDeadline, isReservationDue, expireInUnit, expireReservationForOrder, expireReservations, startReservationWorker };

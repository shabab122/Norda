const boundedInteger = (name, fallback, min, max) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
};
const reservationMinutes = () => boundedInteger("PAYMENT_RESERVATION_MINUTES", 30, 1, 1440);
const sweepSeconds = () => boundedInteger("RESERVATION_SWEEP_SECONDS", 30, 5, 3600);
const nextReservationDeadline = (now = new Date()) => new Date(now.getTime() + reservationMinutes() * 60000);
module.exports = { reservationMinutes, sweepSeconds, nextReservationDeadline };

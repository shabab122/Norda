const gateway = require("./sslcommerzService");
const { reservationDeadline } = require("./reservationService");
const orderView = (order) => {
  const data = order.toObject ? order.toObject() : { ...order };
  const review = data.paymentStatus === "review";
  const recoverable = !data.isPaid && !review && (data.status === "pending" || data.status === "processing" || (data.status === "cancelled" && Boolean(data.reservationExpiredAt)));
  return { ...data, paymentRecovery: {
    reservationExpiresAt: reservationDeadline(data), reservationExpiredAt: data.reservationExpiredAt || null,
    canRetry: data.paymentMethod === "sslcommerz" && recoverable && gateway.isConfigured(),
  } };
};
module.exports = { orderView };

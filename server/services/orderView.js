const gateway = require("./sslcommerzService");
const { reservationDeadline } = require("./reservationService");
const { hasBlockingOperation } = require("./orderOperationStore");
const orderView = (order, options = {}) => {
  const data = order.toObject ? order.toObject() : { ...order };
  // New operational evidence belongs to administrators. Keep the original
  // customer order contract while excluding private resolution/bank fields.
  if (options.includeInternal !== true) for (const field of ["reviewResolutionNote", "reviewedBy", "settledPayment", "settledValidationId", "settledBankTransactionId"]) delete data[field];
  const review = data.paymentStatus === "review";
  const recoverable = !hasBlockingOperation(data) && !data.isPaid && !review && (data.status === "pending" || data.status === "processing" || (data.status === "cancelled" && Boolean(data.reservationExpiredAt)));
  return { ...data, paymentRecovery: {
    reservationExpiresAt: reservationDeadline(data), reservationExpiredAt: data.reservationExpiredAt || null,
    canRetry: data.paymentMethod === "sslcommerz" && recoverable && gateway.isConfigured(),
  } };
};
module.exports = { orderView };

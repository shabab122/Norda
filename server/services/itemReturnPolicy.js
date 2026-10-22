const { getSettings } = require("./storeSettingsService");
const httpError = require("../utils/httpError");
async function eligibility(order, session = null) {
  const config = order.returnPolicy || await getSettings(session);
  const days = config.returnWindowDays ?? 30;
  const delivered = order.shipment?.deliveredAt || order.paidAt || order.updatedAt || order.createdAt;
  const deadline = new Date(new Date(delivered).getTime() + days * 86400000);
  const allowed = order.status === "delivered" && order.isPaid && order.paymentStatus === "paid" && days > 0 && Number.isFinite(+deadline) && Date.now() <= +deadline;
  return { allowed, returnWindowDays: days, exchangeEnabled: config.exchangeEnabled !== false, deliveredAt: delivered, deadline: Number.isFinite(+deadline) ? deadline : null, legacyDeliveryDate: !order.shipment?.deliveredAt };
}
async function requireEligible(order, type, session = null) {
  const policy = await eligibility(order, session);
  if (!policy.allowed) throw httpError(409, "This order is not eligible: returns require a paid, delivered order within its return window");
  if (type === "exchange" && !policy.exchangeEnabled) throw httpError(409, "Exchanges are disabled for this order");
  return policy;
}
module.exports = { eligibility, requireEligible };

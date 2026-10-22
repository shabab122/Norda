const Coupon = require("../models/Coupon");
const Redemption = require("../models/CouponRedemption");
const httpError = require("../utils/httpError");
const { amount, text } = require("./storeSettingsService");
const { insertDocument, querySession, writeOptions } = require("./databaseUnit");
const { withOperationLock } = require("./operationLock");

const normalizeCode = (value) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(value.trim().toUpperCase())) throw httpError(400, "Use a coupon code with 3–32 letters, numbers, _ or -");
  return value.trim().toUpperCase();
};
const normalizeCoupon = (body, current = null) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "Invalid coupon");
  const code = normalizeCode(body.code ?? current?.code); if (!code) throw httpError(400, "A coupon code is required");
  if (current && code !== current.code) throw httpError(409, "Keep the original coupon code; create another coupon instead");
  const type = body.type ?? current?.type;
  if (!["percentage", "fixed"].includes(type)) throw httpError(400, "Choose a percentage or fixed discount");
  const out = { code, type, title: text(body.title ?? current?.title ?? code, 100, "coupon title") };
  if (!out.title) throw httpError(400, "A coupon title is required");
  for (const key of ["value", "minSubtotal", "maxDiscount"]) out[key] = amount(body[key] ?? current?.[key] ?? 0, key);
  if (out.value <= 0 || (type === "percentage" && out.value > 100)) throw httpError(400, "Percentage must be greater than 0 and at most 100; fixed discount must be positive");
  for (const key of ["usageLimit", "perUserLimit"]) { const v = body[key] ?? current?.[key] ?? (key === "perUserLimit" ? 1 : 0); if (!Number.isSafeInteger(v) || v < 0 || v > 10000000) throw httpError(400, "Usage limits must be non-negative whole numbers"); out[key] = v; }
  if (out.usageLimit && out.usageLimit < (current?.usedCount || 0)) throw httpError(400, "Usage limit cannot be below already recorded uses");
  for (const key of ["startsAt", "endsAt"]) { const value = body[key] ?? current?.[key]; if (!(typeof value === "string" || value instanceof Date) || !Number.isFinite(new Date(value).getTime())) throw httpError(400, "Provide valid coupon start and expiry dates"); out[key] = new Date(value); }
  if (out.endsAt <= out.startsAt) throw httpError(400, "Coupon expiry must be after its start");
  for (const key of ["isActive", "isPublic"]) { const v = body[key] ?? current?.[key] ?? true; if (typeof v !== "boolean") throw httpError(400, "Coupon switches must be true or false"); out[key] = v; }
  return out;
};
const discountFor = (coupon, subtotal, now = new Date()) => {
  if (!coupon || !coupon.isActive || new Date(coupon.startsAt) > now || new Date(coupon.endsAt) <= now) throw httpError(409, "This coupon is unavailable or expired");
  if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) throw httpError(409, "This coupon has reached its usage limit");
  if (subtotal < coupon.minSubtotal) throw httpError(409, "This coupon needs a subtotal of at least BDT " + coupon.minSubtotal);
  const cents = Math.round(subtotal * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) throw httpError(400, "The coupon subtotal is outside the supported range");
  let discount = coupon.type === "percentage" ? Number((BigInt(cents) * BigInt(Math.round(coupon.value * 100)) + 5000n) / 10000n) : Math.round(coupon.value * 100);
  if (coupon.maxDiscount > 0) discount = Math.min(discount, Math.round(coupon.maxDiscount * 100));
  discount = Math.min(cents, discount);
  if (!Number.isSafeInteger(discount) || discount <= 0) throw httpError(409, "This coupon does not discount the current cart");
  return discount / 100;
};
const quoteCoupon = async (code, subtotal, userId, session = null) => {
  code = normalizeCode(code);
  if (!code) return { coupon: null, discountAmount: 0 };
  const coupon = await querySession(Coupon.findOne({ code }), session);
  const discountAmount = discountFor(coupon, subtotal);
  if (coupon.perUserLimit && await querySession(Redemption.countDocuments({ coupon: coupon._id, user: userId }), session) >= coupon.perUserLimit) throw httpError(409, "You have reached this coupon's per-account limit");
  return { coupon: { _id: coupon._id, code: coupon.code, title: coupon.title, type: coupon.type, value: coupon.value, minSubtotal: coupon.minSubtotal, maxDiscount: coupon.maxDiscount }, discountAmount };
};
// Each successfully created order consumes one use. Cancellation, expiry,
// payment retry and refunds retain that use and the order's discount snapshot.
const recordRedemption = async (order, unit) => {
  if (!order.coupon?.code) return;
  const changed = await Coupon.findOneAndUpdate({ _id: order.coupon._id, code: order.coupon.code }, { $inc: { usedCount: 1 } }, writeOptions(unit.session, { new: true }));
  if (!changed) throw httpError(409, "Coupon changed. Review checkout again.");
  unit.compensate(() => Coupon.updateOne({ _id: changed._id }, { $inc: { usedCount: -1 } }));
  const row = await insertDocument(Redemption, { coupon: changed._id, code: changed.code, order: order._id, user: order.user, discountAmount: order.discountAmount }, unit.session);
  unit.compensate(() => Redemption.deleteOne({ _id: row._id }));
};
const withCouponLock = (code, work) => code ? withOperationLock("coupon:" + normalizeCode(code), work) : work();
const saveCoupon = async (id, body) => {
  const initial = id ? await Coupon.findById(id) : null;
  if (id && !initial) throw httpError(404, "Coupon not found");
  const code = normalizeCode(body.code ?? initial?.code);
  return withCouponLock(code, async () => {
    const current = id ? await Coupon.findById(id) : null;
    if (current && (!Number.isSafeInteger(body.revision) || body.revision !== (current.revision || 0))) throw httpError(409, "Coupon changed. Reload before saving.");
    const fields = normalizeCoupon(body, current);
    if (!current) return Coupon.create({ ...fields, usedCount: 0, revision: 0 });
    const saved = await Coupon.findOneAndUpdate({ _id: id, revision: current.revision || 0 }, { $set: fields, $inc: { revision: 1 } }, { new: true, runValidators: true });
    if (!saved) throw httpError(409, "Coupon changed. Reload before saving.");
    return saved;
  });
};
module.exports = { normalizeCode, normalizeCoupon, discountFor, quoteCoupon, recordRedemption, withCouponLock, saveCoupon };

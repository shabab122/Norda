const Order = require("../models/Order");
const Refund = require("../models/Refund");
const httpError = require("../utils/httpError");
const { moneyCents } = require("./orderOperationStore");
const { rowsToCsv } = require("../utils/csv");
const day = (d) => new Date(new Date(d).getTime() + 21600000).toISOString().slice(0, 10);
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError(400, "Use YYYY-MM-DD report dates");
  const parsed = new Date(value + "T00:00:00+06:00");
  if (!Number.isFinite(+parsed) || day(parsed) !== value) throw httpError(400, "Invalid report date");
  return parsed;
}
// Largest remainder allocates every paisa of a coupon exactly once.
function allocateDiscount(items, discount) {
  const amounts = items.map((i) => moneyCents(i.price) * i.quantity), gross = amounts.reduce((s, n) => s + n, 0);
  if (!Number.isSafeInteger(discount) || discount < 0 || discount > gross || amounts.some((n) => !Number.isSafeInteger(n) || n < 0)) throw httpError(409, "Historical order amounts need review");
  if (!gross) return amounts.map(() => 0);
  const total = BigInt(gross), off = BigInt(discount);
  const parts = amounts.map((n, index) => ({ index, value: Number(BigInt(n) * off / total), remainder: BigInt(n) * off % total }));
  let remaining = discount - parts.reduce((s, p) => s + p.value, 0);
  [...parts].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1).forEach((p) => { if (remaining-- > 0) p.value++; });
  return parts.map((p) => p.value);
}
async function salesReport(query) {
  const today = day(new Date()); const defaultFrom = day(new Date(Date.now() - 29 * 86400000));
  const from = query.from || defaultFrom, to = query.to || today, start = date(from), end = new Date(+date(to) + 86400000);
  if (end <= start || end - start > 366 * 86400000) throw httpError(400, "Choose a report range from 1 to 366 days");
  const group = query.group || "day"; if (!["day", "month"].includes(group)) throw httpError(400, "Group by day or month");
  const filter = { isPaid: true, paymentStatus: "paid", paymentMethod: { $ne: "demo" }, $or: [{ paidAt: { $gte: start, $lt: end } }, { paidAt: { $exists: false }, createdAt: { $gte: start, $lt: end } }] };
  const orders = await Order.find(filter).sort({ paidAt: 1, _id: 1 }).limit(10001).lean();
  if (orders.length > 10000) throw httpError(413, "More than 10,000 orders match. Choose a shorter range.");
  const refunds = orders.length ? await Refund.find({ order: { $in: orders.map((o) => o._id) }, scope: "order", status: { $in: ["succeeded", "awaiting_return", "queued", "submitting", "pending", "unknown"] } }).limit(50001).lean() : [];
  if (refunds.length > 50000) throw httpError(413, "Too many refund records. Choose a shorter range.");
  const refundsByOrder = new Map();
  for (const row of refunds) { const id = String(row.order); if (!refundsByOrder.has(id)) refundsByOrder.set(id, []); refundsByOrder.get(id).push(row); }
  const summary = { orders: 0, units: 0, grossItems: 0, couponSavings: 0, shipping: 0, charged: 0, confirmedRefunds: 0, pendingRefunds: 0, netRevenue: 0 }, buckets = new Map(), sku = new Map(), coupons = new Map();
  for (let time = +start; time < +end; time += 86400000) { const key = group === "month" ? day(time).slice(0, 7) : day(time); if (!buckets.has(key)) buckets.set(key, { period: key, ...summary }); }
  for (const order of orders) {
    const paidDate = day(order.paidAt || order.createdAt), key = group === "month" ? paidDate.slice(0, 7) : paidDate;
    if (!buckets.has(key)) buckets.set(key, { period: key, ...summary });
    const entry = { orders: 1, units: order.items.reduce((s, i) => s + i.quantity, 0), grossItems: moneyCents(order.subtotal), couponSavings: moneyCents(order.discountAmount), shipping: moneyCents(order.shippingFee), charged: moneyCents(order.totalAmount), confirmedRefunds: 0, pendingRefunds: 0, netRevenue: 0 };
    for (const refund of (refundsByOrder.get(String(order._id)) || [])) {
      if (refund.status === "succeeded" && new Date(refund.completedAt || refund.updatedAt || refund.createdAt) < end) entry.confirmedRefunds += moneyCents(refund.amount);
      else if (refund.status !== "succeeded") entry.pendingRefunds += moneyCents(refund.amount);
    }
    entry.netRevenue = entry.charged - entry.confirmedRefunds;
    for (const [k, value] of Object.entries(entry)) { summary[k] += value; buckets.get(key)[k] += value; }
    const allocated = allocateDiscount(order.items, moneyCents(order.discountAmount));
    order.items.forEach((item, index) => {
      const id = String(item.product) + ":" + (item.variantId || "base");
      const value = sku.get(id) || { product: String(item.product), variantId: item.variantId || null, name: item.name, sku: item.sku || "Base product", size: item.size || "", color: item.color || "", units: 0, grossItems: 0, couponSavings: 0, merchandiseRevenue: 0 };
      value.units += item.quantity; value.grossItems += moneyCents(item.price) * item.quantity; value.couponSavings += allocated[index]; value.merchandiseRevenue = value.grossItems - value.couponSavings; sku.set(id, value);
    });
    if (order.coupon?.code) { const c = coupons.get(order.coupon.code) || { code: order.coupon.code, orders: 0, savings: 0 }; c.orders++; c.savings += entry.couponSavings; coupons.set(c.code, c); }
  }
  const products = new Map();
  for (const row of sku.values()) { const p = products.get(row.product) || { product: row.product, name: row.name, units: 0, grossItems: 0, couponSavings: 0, merchandiseRevenue: 0 }; for (const key of ["units", "grossItems", "couponSavings", "merchandiseRevenue"]) p[key] += row[key]; products.set(row.product, p); }
  const moneyKeys = ["grossItems", "couponSavings", "shipping", "charged", "confirmedRefunds", "pendingRefunds", "netRevenue", "merchandiseRevenue", "savings"];
  const convert = (v) => Object.fromEntries(Object.entries(v).map(([k, n]) => { if (typeof n === "number" && !Number.isSafeInteger(n)) throw httpError(409, "Report totals exceed the safe accounting range. Choose a shorter range."); return [k, moneyKeys.includes(k) ? n / 100 : n]; }));
  return { from, to, group, timezone: "Asia/Dhaka", currency: "BDT", basis: "Paid-order cohort; confirmed order refunds through the end date. Pending refunds are current reservations. Excludes simulations, unverified payments and extra-payment refunds. SKU revenue is after coupons, before shipping and unallocated refunds.", summary: convert(summary), topProducts: [...products.values()].sort((a, b) => b.units - a.units || b.merchandiseRevenue - a.merchandiseRevenue).slice(0, 100).map(convert), timeline: [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period)).map(convert), topSkus: [...sku.values()].sort((a, b) => b.units - a.units || b.merchandiseRevenue - a.merchandiseRevenue).slice(0, 100).map(convert), coupons: [...coupons.values()].sort((a, b) => b.savings - a.savings).map(convert) };
}
function reportCsv(report) {
  const headers = ["Period", "Orders", "Units", "Gross items", "Coupon savings", "Shipping", "Charged", "Confirmed refunds", "Pending refunds (current)", "Net revenue"];
  const keys = ["period", "orders", "units", "grossItems", "couponSavings", "shipping", "charged", "confirmedRefunds", "pendingRefunds", "netRevenue"];
  return rowsToCsv(headers.map((label, i) => ({ label, key: keys[i] })), report.timeline);
}
module.exports = { salesReport, allocateDiscount, reportCsv, date };

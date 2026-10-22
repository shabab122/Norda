const test = require("node:test");
const assert = require("node:assert/strict");
const { discountFor, normalizeCoupon, normalizeCode } = require("../services/couponService");
const { calculateTotals } = require("../services/orderService");
const { safeLink, normalize, defaults } = require("../services/storeSettingsService");
const { parseCsv, columns, rowsFor } = require("../services/inventoryToolsService");
const { rowsToCsv } = require("../utils/csv");
const offer = (fields = {}) => ({ isActive: true, startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 100000), usedCount: 0, usageLimit: 0, value: 12.5, type: "percentage", minSubtotal: 0, maxDiscount: 0, ...fields });
test("Discount calculation rounds to paisa, caps percentages/fixed offers and never discounts delivery", () => {
  assert.equal(discountFor(offer(), 10.01), 1.25);
  assert.equal(discountFor(offer({ value: 100 }), 10.01), 10.01);
  assert.equal(discountFor(offer({ type: "fixed", value: 999 }), 10.01), 10.01);
  assert.equal(discountFor(offer({ maxDiscount: 50 }), 1000), 50);
  assert.deepEqual(calculateTotals([{ price: 5000, quantity: 1 }], { freeShippingThreshold: 5000, flatShippingFee: 120, discountAmount: 500 }), { subtotal: 5000, shippingFee: 120, totalAmount: 4620 });
  for (const discountAmount of [-1, 1001, Infinity, 1.001]) assert.throws(() => calculateTotals([{ price: 1000, quantity: 1 }], { discountAmount }), /discount/);
});
test("Coupon time/limit boundaries and malformed values cannot produce a usable discount", () => {
  const now = new Date();
  assert.throws(() => discountFor(offer({ endsAt: now }), 1000, now), /expired/);
  assert.throws(() => discountFor(offer({ startsAt: new Date(now.getTime() + 1) }), 1000, now), /unavailable/);
  assert.throws(() => discountFor(offer({ usageLimit: 1, usedCount: 1 }), 1000), /limit/);
  assert.equal(normalizeCode(" save_10 "), "SAVE_10");
  for (const code of [{}, [], "a", "<script>", "A".repeat(33)]) assert.throws(() => normalizeCode(code), /coupon code/);
  assert.throws(() => normalizeCoupon({ ...offer(), code: "SAVE10", title: "Saving", value: "10" }), /amount/);
});
test("CSV parser retains embedded commas, quotes, CRLF text and a final empty field", () => {
  const row = { productId: "a".repeat(24), variantId: "", sku: "", productName: 'A "considered", everyday\r\nchoice', size: "", color: "", stock: 10, lowStockThreshold: 2, expectedStock: 5, inventoryVersion: 0, active: "" };
  const csv = "\uFEFF" + rowsToCsv(columns.map((key) => ({ key, label: key })), [row]);
  const parsed = parseCsv(csv); assert.equal(parsed[0].productName, row.productName); assert.equal(parsed[0].active, ""); assert.equal(parsed[0].stock, 10);
  assert.throws(() => parseCsv(csv.replace('"productId"', '"productId"oops')), /quoted/);
  assert.throws(() => parseCsv(csv + "\0"), /CSV/);
});
test("SKU low-stock alerts use the selected option's threshold instead of the parent total", () => {
  const rows = rowsFor({ _id: "a".repeat(24), name: "Shirt", stock: 100, variants: [{ _id: "b".repeat(24), sku: "SMALL", stock: 2, lowStockThreshold: 3 }, { _id: "c".repeat(24), sku: "LARGE", stock: 98, lowStockThreshold: 5 }, { _id: "d".repeat(24), sku: "OLD", stock: 0, isActive: false }] });
  assert.deepEqual(rows.filter((r) => r.lowStock).map((r) => r.sku), ["SMALL"]);
  assert.equal(rowsFor({ _id: "a".repeat(24), name: "Legacy", stock: 5 })[0].lowStock, true);
});
test("Settings reject active links, credentialed URLs and malformed values; policy text stays plain", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,hello", "//other.example", "https://u:p@example.com", "/%2fother.example", "/\\evil"]) assert.throws(() => safeLink(value), /link/);
  assert.equal(safeLink("/help.html#delivery"), "/help.html#delivery");
  for (const url of ["/assets/../secret.png", "/assets/file%20name.png"]) assert.throws(() => safeLink(url, true), /image/);
  const current = defaults(); const normalized = normalize({ revision: 0, policies: { returns: '<script>keep as text</script>\nSecond line' } }, current); assert.match(normalized.policies.returns, /<script>/);
  assert.throws(() => normalize({ revision: 0, faq: [{ question: "?", answer: "" }] }, current), /Complete/);
  assert.throws(() => normalize({ revision: 0, freeShippingThreshold: 1.001 }, current), /decimals/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { allocateDiscount, date, reportCsv } = require("../services/salesReportService");
const { normalizeRequest } = require("../services/itemReturnService");
const { hasPermission, SCOPES } = require("../utils/permissions");
const { normalize, defaults } = require("../services/storeSettingsService");
const crypto = require("node:crypto");
test("Discount allocation conserves every paisa across unequal lines and keeps per-line bounds", () => {
  for (let n = 1; n <= 80; n++) {
    const items = [{ price: n / 100, quantity: n }, { price: (n + 3) / 100, quantity: 3 }, { price: 12.37, quantity: 2 }];
    const gross = items.map((i) => Math.round(i.price * 100) * i.quantity), total = gross.reduce((s, v) => s + v, 0), discount = Math.floor(total * (n % 11) / 10);
    const allocated = allocateDiscount(items, discount); assert.equal(allocated.reduce((s, v) => s + v, 0), discount); allocated.forEach((v, i) => { assert.ok(Number.isSafeInteger(v) && v >= 0 && v <= gross[i]); assert.ok(Math.abs(v - gross[i] * discount / total) < 1); });
  }
  assert.deepEqual(allocateDiscount([{ price: 0, quantity: 1 }], 0), [0]); assert.throws(() => allocateDiscount([{ price: 10, quantity: 1 }], 1001), /review/);
});
test("Only full administrators or explicitly scoped staff receive operational permissions", () => {
  for (const scope of SCOPES) { assert.equal(hasPermission({ role: "admin" }, scope), true); assert.equal(hasPermission({ role: "staff", permissions: [scope] }, scope), true); assert.equal(hasPermission({ role: "user", permissions: [scope] }, scope), false); }
  assert.equal(hasPermission({ role: "staff", permissions: ["payments"] }, "staff"), false);
});
test("Report dates reject impossible calendar days and CSV preserves useful headers", () => {
  assert.equal(date("2024-02-29").toISOString(), "2024-02-28T18:00:00.000Z");
  for (const value of ["2025-02-29", "2026-13-01", "yesterday", "2026-1-1", ["2026-01-01"]]) assert.throws(() => date(value), /date/);
  const csv = reportCsv({ timeline: [{ period: "2026-01", orders: 2, units: 3, grossItems: 1000, couponSavings: 20, shipping: 120, charged: 1100, confirmedRefunds: 100, pendingRefunds: 0, netRevenue: 1000 }] }); assert.match(csv, /^"Period","Orders"/); assert.match(csv, /"2026-01","2","3"/);
});
test("Item requests reject fractional quantities, duplicate lines and unsafe replacement identifiers", () => {
  const base = { requestKey: crypto.randomUUID(), reason: "A careful return request", type: "return", items: [{ lineIndex: 0, quantity: 1 }] };
  for (const items of [[{ lineIndex: 0, quantity: -1 }], [{ lineIndex: 0, quantity: 1.1 }], [{ lineIndex: -1, quantity: 1 }], [{ lineIndex: 0, quantity: 1 }, { lineIndex: 0, quantity: 1 }]]) assert.throws(() => normalizeRequest({ ...base, items }), /quantity|line/);
  assert.throws(() => normalizeRequest({ ...base, type: "exchange" }), /replacement/);
  assert.throws(() => normalizeRequest({ ...base, type: "exchange", items: [{ lineIndex: 0, quantity: 1, replacementProductId: "unsafe" }] }), /identifier/);
  assert.throws(() => normalizeRequest({ ...base, items: [{ lineIndex: 0, quantity: 1, replacementProductId: "000000000000000000000001" }] }), /exchanges/);
  assert.equal(normalizeRequest(base).hash, normalizeRequest({ ...base, reason: "  " + base.reason + "  " }).hash);
});
test("Return settings accept disabled windows but reject fractions, out-of-range days and string booleans", () => {
  const current = defaults(); assert.equal(normalize({ revision: 0, returnWindowDays: 0, exchangeEnabled: false }, current).returnWindowDays, 0);
  for (const returnWindowDays of [-1, 366, 1.5, "30"]) assert.throws(() => normalize({ revision: 0, returnWindowDays }, current), /Return window/);
  assert.throws(() => normalize({ revision: 0, exchangeEnabled: "false" }, current), /Exchange/);
});

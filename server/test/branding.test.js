const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const client = path.join(__dirname, "../../client");
const read = (file) => fs.readFileSync(path.join(client, file), "utf8");
const visible = (html) => html.replace(/<[^>]*>/g, " ");
const id = "1234567890abcdef12345678";
function setup() {
  const elements = {}; const events = {};
  const get = (name) => elements[name] ||= { innerHTML: "", addEventListener() {} };
  const scope = vm.createContext({ console, URLSearchParams, setTimeout() {}, API_BASE_URL: "/api",
    document: { body: { dataset: {} }, getElementById: get, addEventListener(type, callback) { events[type] = callback; } },
    window: { addEventListener() {}, location: { pathname: "/invoice.html", search: "?orderId=" + id }, print() {} },
    Api: { ready: Promise.resolve(), getUser: () => ({ _id: "buyer" }), isLoggedIn: () => true },
  });
  vm.runInContext(read("js/layout.js"), scope);
  return { scope, get, events };
}
test("The same complete Norda wordmark and AI mark resolve in storefront and admin paths", () => {
  const { scope } = setup();
  for (const prefix of ["", "../"]) {
    const html = scope.brandLogoHtml(prefix, prefix ? "admin-logo" : "", prefix ? "Admin" : "");
    assert.match(html, /<strong class="brand-name">Norda<\/strong>/);
    assert.match(html, /aria-label="Norda home"/); assert.doesNotMatch(html, /NOR<span|<span>DA/);
    const image = html.match(/src="([^"]+)"/)[1];
    assert.ok(fs.existsSync(path.resolve(prefix ? path.join(client, "admin") : client, image)));
    assert.equal(html.match(/class="brand-mark"/g).length, 1);
  }
});
test("Invoice keeps one intact brand and a compact truthful payment note without a demo banner", () => {
  const { scope, get } = setup(); vm.runInContext(read("js/invoice.js"), scope);
  const invoice = { invoiceNumber: "NOR-20261018-1234567890AB", paymentStatus: "paid", issuedAt: "2026-10-18", user: { name: '<Buyer "One">', email: "buyer@example.com" }, shippingAddress: { line1: "Road", city: "Dhaka" }, subtotal: 100, shippingFee: 120, totalAmount: 220, items: [], order: { status: "processing", paymentMethod: "demo" } };
  scope.renderInvoice(invoice); const html = get("invoice-root").innerHTML;
  assert.match(html, /<strong class="brand-name">Norda<\/strong>/);
  assert.equal((html.match(/class="brand-mark"/g) || []).length, 1);
  assert.doesNotMatch(visible(html), /\bdemo\b/i); assert.doesNotMatch(html, /demo-notice|DEMO INVOICE/);
  assert.match(html, /Simulated payment · No real charge/); assert.match(html, /Payment was simulated; no money was transferred/);
  assert.match(html, /&lt;Buyer &quot;One&quot;&gt;/); assert.match(html, /NOR-20261018-1234567890AB/);
  scope.renderInvoice({ ...invoice, order: { ...invoice.order, paymentMethod: "cod" } });
  assert.doesNotMatch(get("invoice-root").innerHTML, /Simulated payment|Payment was simulated/);
});
test("Order payment choices and resume links remain accurate, including old cancellation notes", () => {
  const { scope } = setup(); vm.runInContext(read("js/orders.js"), scope);
  const order = { _id: id, createdAt: "2026-10-18", paymentMethod: "demo", paymentChannel: "mobile_banking", paymentStatus: "pending", status: "pending", isPaid: false, totalAmount: 220, subtotal: 100, shippingFee: 120, items: [] };
  const pending = scope.renderOrder(order);
  assert.match(pending, /Mobile Banking \/ bKash/); assert.match(pending, /Resume or cancel payment/); assert.match(pending, /Simulated payment/);
  assert.doesNotMatch(visible(pending), /\bdemo\b/i);
  const cancelled = scope.renderOrder({ ...order, status: "cancelled", cancelReason: "Demo checkout cancelled; no money was charged" });
  assert.doesNotMatch(cancelled, /Resume or cancel payment/); assert.doesNotMatch(visible(cancelled), /\bdemo\b/i);
  assert.match(cancelled, /Checkout cancelled; no money was charged/);
  assert.equal(scope.paymentNote("Keep my Demo Book"), "Keep my Demo Book");
  assert.equal(scope.paymentMethodLabel({ paymentMethod: "cod" }), "Cash on delivery");
  assert.equal(scope.paymentMethodLabel({ paymentMethod: "sslcommerz" }), "SSLCOMMERZ");
  assert.equal(scope.paymentMethodLabel({ paymentMethod: "demo", paymentChannel: "card_bank" }), "Card / Bank");
});
test("Payment results use saved server state and retain simulation disclosure without demo headings", async () => {
  const { scope, get, events } = setup();
  scope.renderHeader = () => {}; scope.renderFooter = () => {};
  vm.runInContext(read("js/payment-result.js"), scope);
  scope.window.location.search = "?status=success&orderId=" + id;
  scope.Api.get = async () => ({ _id: id, paymentMethod: "demo", paymentStatus: "pending", totalAmount: 220 });
  await events.DOMContentLoaded(); assert.match(get("payment-result").innerHTML, /Payment is not confirmed yet/);
  assert.doesNotMatch(visible(get("payment-result").innerHTML), /\bdemo\b/i);
  scope.Api.get = async () => ({ _id: id, paymentMethod: "demo", paymentStatus: "paid", totalAmount: 220 });
  await events.DOMContentLoaded(); assert.match(get("payment-result").innerHTML, /Payment completed/); assert.match(get("payment-result").innerHTML, /No real money was transferred/);
});
test("Every page loads shared branding and the new AI-derived tab icon", () => {
  const pages = fs.readdirSync(client).filter((name) => name.endsWith(".html")).map((name) => name)
    .concat(fs.readdirSync(path.join(client, "admin")).filter((name) => name.endsWith(".html")).map((name) => "admin/" + name));
  assert.equal(pages.length, 27);
  for (const page of pages) {
    const html = read(page); assert.match(html, /css\/branding\.css/, page); assert.match(html, /assets\/brand\/norda-mark\.png/, page);
    assert.doesNotMatch(html.match(/<title>[^]*?<\/title>/)?.[0] || "", /demo/i, page);
  }
});

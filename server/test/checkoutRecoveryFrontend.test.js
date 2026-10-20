const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const read = (file) => fs.readFileSync(path.join(__dirname, "../../client/js", file), "utf8");
const id = "1234567890abcdef12345678";
const setup = () => {
  const storage = new Map(), elements = new Map(), events = {};
  let user = { _id: "buyer-one" };
  const element = () => ({ innerHTML: "", textContent: "", disabled: false, querySelectorAll: () => [], addEventListener() {} });
  const get = (key) => { if (!elements.has(key)) elements.set(key, element()); return elements.get(key); };
  const scope = vm.createContext({ console, URL, URLSearchParams, crypto, setTimeout() {},
    sessionStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    document: { body: { dataset: {} }, addEventListener: (name, callback) => { events[name] = callback; }, getElementById: get, querySelector: (key) => get(key), querySelectorAll: () => [] },
    window: { addEventListener() {}, location: { search: "", hash: "", pathname: "/orders.html", assign(value) { this.href = value; }, reload() {} } },
    Api: { ready: Promise.resolve(), getUser: () => user, isLoggedIn: () => true }, API_BASE_URL: "/api",
  });
  vm.runInContext(read("layout.js"), scope); vm.runInContext(read("orders.js"), scope);
  return { scope, events, storage, get, setUser: (value) => { user = value; }, button: { dataset: { paymentRetry: id }, disabled: false } };
};
test("Retry double-click submits once and redirects only to the verified hosted URL", async () => {
  const { scope, button, storage } = setup(); let complete; const gate = new Promise((resolve) => { complete = resolve; }); const calls = [];
  scope.Api.post = async (url, body) => { calls.push({ url, body }); return gate; };
  const first = scope.retryOrderPayment(button); await scope.retryOrderPayment(button); assert.equal(calls.length, 1); assert.equal(calls[0].url, "/payments/sslcommerz/" + id + "/retry"); assert.ok(calls[0].body.retryKey);
  complete({ checkoutUrl: "https://sandbox.sslcommerz.com/retry" }); await first; assert.equal(scope.window.location.href, "https://sandbox.sslcommerz.com/retry"); assert.equal(storage.size, 0);
});
test("Network timeouts retain the same account/order retry key and enable recovery", async () => {
  const { scope, button, storage } = setup(); const keys = [];
  scope.Api.post = async (url, body) => { keys.push(body.retryKey); throw new Error("Connection lost <script>"); };
  await scope.retryOrderPayment(button); assert.equal(button.disabled, false); assert.equal(storage.size, 1);
  await scope.retryOrderPayment(button); assert.equal(keys[0], keys[1]); assert.equal(scope.window.location.href, undefined);
});
test("Changing account during retry cannot navigate the new account to the old hosted session", async () => {
  const { scope, button, setUser } = setup(); let complete; const gate = new Promise((resolve) => { complete = resolve; }); scope.Api.post = async () => gate;
  const first = scope.retryOrderPayment(button); setUser({ _id: "buyer-two" }); complete({ checkoutUrl: "https://sandbox.sslcommerz.com/old-account" }); await first; assert.equal(scope.window.location.href, undefined);
});
test("Unsafe payment redirects are rejected and existing paid orders open their result", async () => {
  for (const checkoutUrl of ["http://sandbox.sslcommerz.com/pay", "https://sslcommerz.com.evil.example/pay", "javascript:alert(1)"]) {
    const { scope, button } = setup(); scope.Api.post = async () => ({ checkoutUrl }); await scope.retryOrderPayment(button); assert.equal(scope.window.location.href, undefined); assert.equal(button.disabled, false);
  }
  const { scope, button } = setup(); scope.Api.post = async () => ({ alreadyPaid: true }); await scope.retryOrderPayment(button); assert.equal(scope.window.location.href, "payment-result.html?orderId=" + id);
});
test("My Orders shows expired reservations and an accessible recovery action without exposing unescaped names", () => {
  const { scope } = setup();
  const order = { _id: id, createdAt: new Date().toISOString(), status: "cancelled", paymentStatus: "cancelled", paymentMethod: "sslcommerz", subtotal: 1000, shippingFee: 120, totalAmount: 1120, reservationExpiredAt: new Date().toISOString(), items: [{ product: id, name: '<Lamp "Blue">', quantity: 1, price: 1000 }], paymentRecovery: { canRetry: true } };
  const html = scope.renderOrder(order); assert.match(html, /Reservation expired/); assert.match(html, /data-payment-retry/); assert.match(html, /aria-live="polite"/); assert.match(html, /&lt;Lamp &quot;Blue&quot;&gt;/); assert.doesNotMatch(html, /<Lamp/);
});
test("A stale orders response after an account change does not render another customer's data", async () => {
  const { scope, setUser, get } = setup(); let complete; scope.Api.get = async () => new Promise((resolve) => { complete = resolve; }); const pending = scope.loadOrders();
  setUser({ _id: "buyer-two" }); complete([]); await pending; assert.equal(get("orders-root").innerHTML, "");
});
test("Payment result trusts the saved review/expiry state over a success query hint", async () => {
  for (const status of ["review", "cancelled"]) {
    const { scope, events, get } = setup(); scope.window.location.search = "?status=success&orderId=" + id; scope.renderHeader = () => {}; scope.renderFooter = () => {};
    scope.Api.get = async () => ({ _id: id, totalAmount: 1120, paymentStatus: status, paymentMethod: "sslcommerz", reservationExpiredAt: new Date().toISOString() });
    vm.runInContext(read("payment-result.js"), scope); await events.DOMContentLoaded();
    assert.match(get("payment-result").innerHTML, status === "review" ? /Store review needed/ : /Reservation expired/); assert.doesNotMatch(get("payment-result").innerHTML, /Your order is paid/);
  }
});

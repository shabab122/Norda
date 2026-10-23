const test = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const read = name => fs.readFileSync(path.join(__dirname, "../../client", name), "utf8"), id = "a".repeat(24);
function context(file) {
  let user = { _id: "first-user", name: "First", role: "admin" }; const elements = new Map(), storage = new Map(), events = {};
  const el = key => { if (!elements.has(key)) elements.set(key, { innerHTML: "", textContent: "", value: "", disabled: false, hidden: false, checked: false, dataset: {}, appendChild() {}, setAttribute() {}, addEventListener(type, fn) { this[type] = fn; }, querySelectorAll: () => [], querySelector: () => null }); return elements.get(key); };
  const scope = vm.createContext({ console, URL, URLSearchParams, crypto, setTimeout() {}, document: { body: { dataset: {} }, addEventListener: (e, fn) => events[e] = fn, getElementById: el, querySelectorAll: () => [], createElement: () => el(crypto.randomUUID()) }, window: { location: { pathname: "/admin/settlements.html", search: "", hash: "", href: "", assign(value) { this.href = value; } }, addEventListener() {} }, sessionStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }, localStorage: { setItem: (k, v) => storage.set(k, v) }, Guest: { current: null }, Api: { ready: Promise.resolve(), getUser: () => user, isLoggedIn: () => !!user, isAdmin: () => user?.role === "admin", can: s => user?.role === "admin" || user?.permissions?.includes(s) } });
  for (const name of ["js/layout.js", "js/management-common.js", file]) if (name) vm.runInContext(read(name), scope);
  return { scope, el, events, storage, user: value => user = value };
}
test("Guest session creation coalesces concurrent add-to-cart preparation and keeps tokens out of browser storage", async () => {
  const storage = new Map(); let creates = 0, finish;
  const scope = vm.createContext({ Promise, Date, window: { addEventListener() {} }, localStorage: { setItem: (k, v) => storage.set(k, v) }, Api: { ready: Promise.resolve(), isLoggedIn: () => false, get: async () => ({ active: false }), post: () => { creates++; return new Promise(r => finish = r); } } });
  vm.runInContext(read("js/guest.js"), scope); await scope.Api.ready; const guest = vm.runInContext("Guest", scope);
  const first = guest.ensure(), second = guest.ensure(); assert.equal(creates, 1); finish({ active: true, id, email: "" }); await Promise.all([first, second]); assert.equal(guest.current.id, id); assert.deepEqual([...storage.keys()], ["norda_guest_revision"]); assert.ok(!JSON.stringify([...storage.values()]).includes(id));
});
test("An expired guest cookie cannot sign a registered user out; ordinary auth expiry still revokes that user", async () => {
  let expired = false; const storage = new Map(), requests = [];
  const scope = vm.createContext({ console, URL, AbortController, setTimeout, clearTimeout, CustomEvent: class { constructor(type) { this.type = type; } }, API_BASE_URL: "/api", localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }, sessionStorage: { removeItem() {} }, window: { addEventListener() {}, dispatchEvent() {} }, fetch: async (url, options) => { requests.push({ url, options }); const status = url === "/api/guest/orders" || expired ? 401 : 200; const data = url === "/api/auth/profile" ? { _id: "registered", name: "Buyer", role: "user" } : { active: true, id }; return { ok: status === 200, status, headers: { get: () => "application/json" }, json: async () => data }; } });
  vm.runInContext(read("js/api.js"), scope); vm.runInContext(read("js/guest.js"), scope); const api = vm.runInContext("Api", scope), guest = vm.runInContext("Guest", scope); await api.ready;
  await assert.rejects(api.get("/guest/orders")); assert.equal(api.getUser()._id, "registered"); assert.equal(guest.current, null);
  expired = true; await assert.rejects(api.get("/auth/profile")); assert.equal(api.getUser(), null);
  guest.current = { id, active: true }; await assert.rejects(api.get("/cart")); const request = requests.at(-1); assert.equal(request.options.credentials, "include"); assert.equal(request.options.headers["X-Norda-Guest-ID"], id); assert.equal(request.options.headers["X-Norda-Guest"], "1");
});
test("Guest action retry keys use the private shopping identity and change when that identity changes", () => {
  const x = context(); x.user(null); x.scope.Guest.current = { id: "guest-a" }; const first = x.scope.managementKey("pickup", { order: id }); assert.equal(x.scope.managementKey("pickup", { order: id }), first); x.scope.Guest.current = { id: "guest-b" }; assert.notEqual(x.scope.managementKey("pickup", { order: id }), first);
});
test("Settlement previews discard changed CSV and cannot enable an import for a different staff account", async () => {
  const x = context("admin/settlements.js"); vm.runInContext('settlementOwner = "first-user"', x.scope); x.el("settlement-csv").value = "first CSV"; x.el("settlement-name").value = "Statement"; let finish; x.scope.Api.post = () => new Promise(r => finish = r);
  const first = x.scope.previewSettlement(); x.el("settlement-csv").value = "edited CSV"; finish({ sourceHash: "old", matched: 0, exceptions: 0, entries: [] }); await first; assert.equal(x.el("settlement-apply").disabled, true);
  const second = x.scope.previewSettlement(); x.user({ _id: "new-staff", role: "admin" }); finish({ sourceHash: "old", matched: 0, exceptions: 0, entries: [] }); await second; assert.equal(x.el("settlement-preview-root").innerHTML, "");
});
test("Settlement cells escape imported references and matched lines have no mutation form", () => {
  const x = context("admin/settlements.js"), value = x.scope.settlementTable([{ _id: id, order: id, reference: '<script>bank</script>', provider: 'A "bank"', kind: "cod_remittance", gross: 100, fee: 2, net: 98, status: "matched", reason: '<verified>' }]); assert.match(value, /&lt;script&gt;bank/); assert.match(value, /A &quot;bank&quot;/); assert.doesNotMatch(value, /<script>|data-settlement-resolve/);
});
test("Exchange receipt escapes product data and offers no payment while its refund is pending", async () => {
  const x = context("js/exchange-payment.js"); vm.runInContext('exchangeCustomerOwner = "first-user"; exchangeCustomerId = "' + id + '"', x.scope); x.scope.Api.get = async () => ({ item: { _id: id, order: id, status: "approved", exchangeInvoiceNumber: '<adjustment>', exchangeBalance: 100, exchangePaymentStatus: "refund_pending", items: [{ name: '<Item "A">', quantity: 1, creditAmount: 90, replacement: { name: '<Replacement>', price: 200 } }] }, payments: [], gatewayEnabled: true, simulationEnabled: true }); await x.scope.loadExchangePayment(); const html = x.el("exchange-payment-root").innerHTML; assert.match(html, /&lt;Item &quot;A&quot;&gt;/); assert.match(html, /original invoice is preserved/); assert.doesNotMatch(html, /id="exchange-pay-online"|id="exchange-pay-simulation"|<Replacement>/);
});
test("A late exchange response cannot display the previous customer's payment information", async () => {
  const x = context("js/exchange-payment.js"); vm.runInContext('exchangeCustomerOwner = "first-user"; exchangeCustomerId = "' + id + '"', x.scope); let finish; x.scope.Api.get = () => new Promise(r => finish = r); const pending = x.scope.loadExchangePayment(); x.user({ _id: "other-user", role: "user" }); finish({ item: {} }); await pending; assert.equal(x.el("exchange-payment-root").innerHTML, "");
});
test("Availability alert history escapes catalog text and drops a stale account response", async () => {
  const x = context("js/stock-alerts.js"); vm.runInContext('stockAlertOwner = "first-user"', x.scope); x.scope.Api.get = async () => [{ _id: id, product: { _id: id, name: '<Unsafe "product">' }, variantKey: "base", active: true, deliveryStatus: "waiting" }]; await x.scope.loadStockAlerts(); assert.match(x.el("stock-alerts-root").innerHTML, /&lt;Unsafe &quot;product&quot;&gt;/); const html = x.el("stock-alerts-root").innerHTML; let finish; x.scope.Api.get = () => new Promise(r => finish = r); const pending = x.scope.loadStockAlerts(); x.user({ _id: "other-user" }); finish([]); await pending; assert.equal(x.el("stock-alerts-root").innerHTML, html);
});
test("Whole-order and item return pickups link to their respective receipt tools", async () => {
  const x = context("admin/return-pickups.js"); vm.runInContext('pickupAdminOwner = "first-user"', x.scope); x.scope.Api.get = async () => ({ items: [false, true].map((whole, i) => ({ _id: String(i).repeat(24), order: id, orderRequest: whole ? id : undefined, status: "arrived", history: [{ status: "arrived", note: '<Carrier note>', at: new Date().toISOString() }] })), total: 2, page: 1, pages: 1 }); await x.scope.loadAdminPickups(); const html = x.el("pickup-admin-root").innerHTML; assert.match(html, /href="operations.html/); assert.match(html, /href="item-returns.html/); assert.match(html, /&lt;Carrier note&gt;/);
});
test("Warehouse shipment link renders directly with the order, without a second racing order fetch", () => {
  const x = context("js/orders.js"), html = x.scope.renderOrder({ _id: id, createdAt: new Date().toISOString(), status: "pending", paymentMethod: "cod", paymentStatus: "pending", items: [], fulfillmentManaged: true, totalAmount: 120, shippingFee: 120 }); assert.match(html, />Track warehouse parcels<\/a>/); assert.equal((read("js/orders.js").match(/Api.get\("\/orders\/my"\)/g) || []).length, 1);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const id = "a".repeat(24), variant = "b".repeat(24);
function setup(file) {
  const elements = new Map(), storage = new Map(), events = {};
  let user = { _id: "buyer-one", name: "Buyer", role: "user", permissions: [] };
  const get = (key) => { if (!elements.has(key)) elements.set(key, { innerHTML: "", textContent: "", value: "", disabled: false, hidden: false, checked: false, dataset: {}, appendChild() {}, setAttribute() {}, addEventListener(t, fn) { this[t] = fn; }, querySelectorAll() { return []; }, querySelector() { return null; } }); return elements.get(key); };
  const scope = vm.createContext({ console, crypto, URL, URLSearchParams, setTimeout() {}, API_BASE_URL: "/api", sessionStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) }, document: { body: { dataset: {} }, addEventListener: (t, fn) => events[t] = fn, getElementById: get, querySelectorAll: () => [], querySelector: () => null, createElement: () => get(crypto.randomUUID()) }, window: { addEventListener() {}, location: { pathname: "/item-returns.html", search: "?orderId=" + id, href: "", assign(v) { this.href = v; } }, confirm: () => true }, Api: { ready: Promise.resolve(), getUser: () => user, isAdmin: () => user?.role === "admin", isLoggedIn: () => !!user, can: (s) => user?.role === "admin" || (user?.role === "staff" && user.permissions.includes(s)) } });
  for (const filename of ["js/layout.js", "js/management-common.js", file]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../../client", filename), "utf8"), scope);
  return { scope, get, storage, events, setUser(u) { user = u; } };
}
test("Item-return history escapes content and blocks unsafe replacement tracking links", () => {
  const { scope } = setup("js/item-returns.js");
  const html = scope.itemCaseHtml({ _id: id, order: id, type: "exchange", status: "shipped", reason: "<script>alert(1)</script>", decisionMessage: '<Store "note">', items: [{ name: '<Item "A">', sku: "<SKU>", quantity: 1, replacement: { sku: 'Large "size"', color: "<Navy>" } }], shipment: { courierName: "<Courier>", trackingNumber: '"123"', trackingUrl: "javascript:alert(1)" }, createdAt: new Date().toISOString() });
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;Item &quot;A&quot;&gt;/); assert.match(html, /&lt;Store &quot;note&quot;&gt;/); assert.doesNotMatch(html, /href="javascript|<script>/);
  assert.equal(scope.managementSafeLink("https://user:secret@example.com/track"), ""); assert.equal(scope.managementSafeLink("https://courier.example/track"), "https://courier.example/track");
});
test("Admin item-case forms gate refund confirmation and restocking by the case state", () => {
  const { scope } = setup("admin/item-returns.js");
  const c = { _id: id, order: id, type: "return", status: "approved", reason: "A reason", items: [{ lineIndex: 0, name: "A shirt", quantity: 1, creditAmount: 10, sku: "NOR-M" }], refundDetails: { _id: variant, status: "awaiting_return", gateway: "manual", amount: 10 }, createdAt: new Date().toISOString() };
  const approved = scope.adminItemCaseHtml(c); assert.match(approved, /data-action="receive"/); assert.doesNotMatch(approved, /data-action="confirm"/);
  const received = scope.adminItemCaseHtml({ ...c, status: "received", refundDetails: { ...c.refundDetails, status: "pending" } }); assert.match(received, /Money was actually returned/); assert.doesNotMatch(received, /data-action="receive"/);
  const completed = scope.adminItemCaseHtml({ ...c, status: "completed", refundDetails: { ...c.refundDetails, status: "succeeded" } }); assert.doesNotMatch(completed, /data-case-form/);
});
test("Staff navigation exposes assigned tools and protects administrator-only staff management", () => {
  const { scope, get, setUser } = setup("admin/admin-layout.js"); setUser({ _id: id, name: 'Staff <A>', role: "staff", permissions: ["inventory", "customers"] }); scope.enableSkipLink = () => {}; scope.renderAdminShell("inventory");
  const html = get("admin-sidebar").innerHTML; assert.match(html, /inventory.html/); assert.match(html, /customers.html/); assert.doesNotMatch(html, /href="staff.html|href="operations.html|href="reports.html/); assert.equal(scope.accountHome(scope.Api.getUser()), "admin/workspace.html");
  scope.window.location.pathname = "/admin/products.html"; assert.equal(scope.requireAdmin(), false); assert.equal(scope.window.location.href, "workspace.html"); scope.window.location.pathname = "/admin/inventory.html"; assert.equal(scope.requireAdmin(), true);
});
test("Request retry keys remain stable for an intent and are isolated by signed-in account", () => {
  const { scope, setUser } = setup("js/item-returns.js"), details = { reason: "Selected return", items: [{ lineIndex: 0, quantity: 1 }] };
  const first = scope.managementKey("return", details); assert.equal(scope.managementKey("return", details), first); setUser({ _id: "buyer-two" }); assert.notEqual(scope.managementKey("return", details), first); setUser({ _id: "buyer-one" }); scope.managementForgetKey("return", details); assert.notEqual(scope.managementKey("return", details), first);
});
test("A late item-return response cannot render a different customer's order", async () => {
  const { scope, get, setUser } = setup("js/item-returns.js"); vm.runInContext('itemOwner = "buyer-one"; itemOrder = "' + id + '";', scope); let finish; scope.Api.get = () => new Promise((resolve) => finish = resolve); const pending = scope.loadItemCases(); setUser({ _id: "buyer-two" }); finish({ cases: [], items: [], policy: {} }); await pending; assert.equal(get("item-policy").innerHTML, "");
});
test("Device lists identify this browser, escape user-agent labels and discard stale refresh responses", async () => {
  const { scope, get } = setup("js/security.js"); vm.runInContext('securityOwner = "buyer-one";', scope);
  const row = { _id: id, current: true, device: '<script>device</script>', ipHint: '127.0.0.*', lastSeenAt: new Date().toISOString() };
  scope.Api.get = async () => [row]; await scope.loadDeviceSessions(); assert.match(get("sessions-root").innerHTML, /This device/); assert.match(get("sessions-root").innerHTML, /&lt;script&gt;device/); assert.doesNotMatch(get("sessions-root").innerHTML, /<script>/);
  let finish; scope.Api.get = () => new Promise((r) => finish = r); const old = scope.loadDeviceSessions(); scope.Api.get = async () => []; await scope.loadDeviceSessions(); const latest = get("sessions-root").innerHTML; finish([row]); await old; assert.equal(get("sessions-root").innerHTML, latest);
});
test("Revoking the current device clears the frontend session and sends the user to sign-in", async () => {
  const { scope, get } = setup("js/security.js"); vm.runInContext('securityOwner = "buyer-one";', scope);
  const button = { disabled: false, dataset: { revoke: id }, addEventListener(t, fn) { this[t] = fn; } }; get("sessions-root").querySelectorAll = () => [button]; scope.Api.get = async () => [{ _id: id, current: true, device: "Browser", lastSeenAt: new Date().toISOString() }]; let revoked, loggedOut = false;
  scope.Api.del = async (url) => { revoked = url; return { currentRevoked: true }; }; scope.Api.logout = () => loggedOut = true;
  await scope.loadDeviceSessions(); await button.click(); assert.equal(revoked, "/auth/sessions/" + id); assert.equal(loggedOut, true); assert.equal(scope.window.location.href, "login.html");
});

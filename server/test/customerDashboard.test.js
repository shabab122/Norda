const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = (file) => fs.readFileSync(path.join(__dirname, "../../client", file), "utf8");
const buyer = { _id: "1234567890abcdef12345678", name: 'Buyer "One"', email: "one@norda.example", role: "user", address: {} };

function setup(initial = buyer) {
  let user = initial; const events = {}; const elements = {}; const storage = new Map();
  const element = (html = "") => ({ innerHTML: html, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, addEventListener() {} });
  elements["site-header"] = element(); elements["site-footer"] = element(); elements["customer-dashboard"] = element("Loading");
  const local = { getItem: (key) => storage.get(key) || null };
  const scope = vm.createContext({ console, URLSearchParams, setTimeout: (callback) => callback(),
    sessionStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    document: { body: { dataset: {}, setAttribute(key, value) { this[key] = value; } }, querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => elements[id] || null, addEventListener: (key, callback) => { events[key] = callback; } },
    window: { localStorage: local, addEventListener: (key, callback) => { events[key] = callback; }, location: { pathname: "/dashboard.html", search: "", reload() { this.reloaded = true; }, replace(value) { this.href = value; } } },
    Api: { ready: Promise.resolve(), getUser: () => user, isLoggedIn: () => !!user, isAdmin: () => user?.role === "admin", setSession(value) { user = value; }, get: async () => { throw new Error("not available"); } }, API_BASE_URL: "/api",
  });
  vm.runInContext(read("js/layout.js"), scope);
  return { scope, events, elements, storage, setUser: (value) => { user = value; }, element };
}

test("Guest, customer and administrator navigation clearly identify the current role", () => {
  const { scope, elements, setUser } = setup(null);
  scope.renderHeader(); assert.match(elements["site-header"].innerHTML, /Create account/); assert.match(elements["site-header"].innerHTML, /Sign in/); assert.doesNotMatch(elements["site-header"].innerHTML, /Customer account/);
  setUser(buyer); scope.renderHeader("dashboard");
  assert.match(elements["site-header"].innerHTML, /Buyer &quot;One&quot;/); assert.match(elements["site-header"].innerHTML, /one@norda.example/); assert.match(elements["site-header"].innerHTML, /Customer account/); assert.match(elements["site-header"].innerHTML, /href="dashboard.html"/); assert.doesNotMatch(elements["site-header"].innerHTML, /Admin workspace/);
  setUser({ ...buyer, role: "admin", name: "Store Admin" }); scope.renderHeader();
  assert.match(elements["site-header"].innerHTML, /Admin workspace/); assert.match(elements["site-header"].innerHTML, /href="admin\/dashboard.html"/);
  scope.renderFooter(); assert.doesNotMatch(elements["site-footer"].innerHTML, />Sign in</);
});

test("Customer dashboard uses account-specific identity, orders, cart and delivery data with escaped output", () => {
  const { scope } = setup(); vm.runInContext(read("js/dashboard.js"), scope);
  const order = { _id: "abcdefabcdefabcdefabcdef", createdAt: "2026-10-17", status: "processing", paymentStatus: "pending", paymentMethod: "cod", totalAmount: 650, items: [{ name: "Notebook", image: "/assets/products/photos/notebook.webp" }] };
  const html = scope.customerDashboardHtml({ ...buyer, address: { line1: '<Road "One">', city: "Dhaka" } }, [order], { items: [{ quantity: 2 }, { quantity: 4, unavailable: true }] });
  assert.match(html, /Buyer &quot;One&quot;/); assert.match(html, /one@norda.example/); assert.match(html, /&lt;Road &quot;One&quot;&gt;/); assert.doesNotMatch(html, /<Road/); assert.match(html, /Items in cart<\/span><strong>2<\/strong>/); assert.match(html, /invoice\.html\?orderId=abcdef/); assert.doesNotMatch(html, /payment attention/);
  const other = scope.customerDashboardHtml({ ...buyer, name: "Other buyer", email: "other@norda.example" }, [], { items: [] });
  assert.match(other, /Other buyer/); assert.match(other, /first find is waiting/); assert.doesNotMatch(other, /one@norda.example|abcdefabcdefabcdefabcdef|admin\/dashboard/);
});

test("Only unresolved active online payments get a payment-attention notice", () => {
  const { scope } = setup(); vm.runInContext(read("js/dashboard.js"), scope);
  const base = { _id: "abcdefabcdefabcdefabcdef", createdAt: "2026-10-17", items: [], totalAmount: 50, paymentMethod: "sslcommerz", paymentStatus: "failed" };
  assert.match(scope.customerDashboardHtml(buyer, [{ ...base, status: "pending" }], {}), /payment attention/);
  assert.doesNotMatch(scope.customerDashboardHtml(buyer, [{ ...base, status: "cancelled" }], {}), /payment attention/);
});

test("Dashboard loads existing owner-scoped APIs and exposes no administration data", async () => {
  const { scope, events, elements } = setup(); const requests = [];
  scope.renderHeader = () => {}; scope.renderFooter = () => {};
  scope.Api.get = async (url) => { requests.push(url); return url === "/auth/profile" ? buyer : url === "/orders/my" ? [] : { items: [] }; };
  vm.runInContext(read("js/dashboard.js"), scope); await events.DOMContentLoaded();
  assert.deepEqual(requests.sort(), ["/auth/profile", "/cart", "/orders/my"].sort());
  assert.equal(elements["customer-dashboard"].attributes["aria-busy"], "false"); assert.match(elements["customer-dashboard"].innerHTML, /one@norda.example/);
});

test("Guest dashboard access returns to sign-in, while admin goes to the admin workspace", async () => {
  for (const user of [null, { ...buyer, role: "admin" }]) {
    const { scope, events } = setup(user); let requests = 0; scope.Api.get = async () => { requests++; };
    vm.runInContext(read("js/dashboard.js"), scope); await events.DOMContentLoaded();
    assert.equal(requests, 0); assert.match(scope.window.location.href, user ? /^admin\/dashboard.html$/ : /^login.html\?next=dashboard.html$/);
  }
});

test("A late dashboard response cannot render the previous user's data after account change", async () => {
  const { scope, elements, setUser } = setup(); let complete;
  const gate = new Promise((resolve) => { complete = resolve; });
  scope.Api.get = async (url) => { await gate; return url === "/auth/profile" ? buyer : url === "/orders/my" ? [] : { items: [] }; };
  vm.runInContext(read("js/dashboard.js"), scope); const loading = scope.loadCustomerDashboard();
  setUser({ ...buyer, _id: "abcdefabcdefabcdefabcdef", name: "Other buyer" }); complete(); await loading;
  assert.equal(elements["customer-dashboard"].innerHTML, "Loading");
});

test("Account changes in another tab clear pending checkout/selection and refresh stale identity", () => {
  const { scope, events, storage } = setup(); scope.Api.currentUser = buyer;
  storage.set("norda_checkout", "old"); storage.set("norda_pending_cart", "old");
  events.storage({ key: "unrelated", oldValue: "a", newValue: "b" }); assert.equal(scope.window.location.reloaded, undefined);
  events.storage({ key: "norda_user", oldValue: "a", newValue: "b" });
  assert.equal(scope.Api.currentUser, null); assert.equal(scope.window.location.reloaded, true); assert.equal(storage.has("norda_checkout"), false); assert.equal(storage.has("norda_pending_cart"), false); assert.equal(scope.document.body["data-account-changing"], "true");
});

test("Restoring a cached private page refreshes its session instead of displaying stale account data", () => {
  const { scope, events } = setup(); events.pageshow({ persisted: false }); assert.equal(scope.window.location.reloaded, undefined);
  events.pageshow({ persisted: true }); assert.equal(scope.window.location.reloaded, true);
});

test("Clearing shared browser storage also refreshes account identity", () => {
  const { scope, events } = setup(); events.storage({ key: null, oldValue: null, newValue: null }); assert.equal(scope.window.location.reloaded, true);
});

for (const mode of ["login", "register"]) for (const role of mode === "login" ? ["user", "admin"] : ["user"]) {
  test(`${mode} defaults to the ${role === "admin" ? "admin" : "customer"} dashboard and preserves explicit shopping destinations`, async () => {
    for (const next of ["", "?next=products.html"]) {
      const { scope, events, elements } = setup(null); let submit;
      const button = { disabled: false }; const user = { ...buyer, role };
      scope.window.location.search = next; scope.renderHeader = () => {}; scope.renderFooter = () => {};
      elements[mode + "-form"] = { addEventListener: (key, callback) => { submit = callback; } };
      elements.name = { value: "Buyer One" }; elements.email = { value: buyer.email }; elements.password = { value: "TestPassword123" };
      scope.Api.post = async () => user;
      vm.runInContext(read("js/auth.js"), scope); await events.DOMContentLoaded();
      await submit({ preventDefault() {}, currentTarget: { querySelector: () => button } });
      assert.equal(scope.window.location.href, next ? "products.html" : role === "admin" ? "admin/dashboard.html" : "dashboard.html");
    }
  });
}

const test = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const read = f => fs.readFileSync(path.join(__dirname, "../../client", f), "utf8"), id = "a".repeat(24);
function node(tag = "div") {
  const result = { tagName: tag.toUpperCase(), nodeType: 1, type: "", id: "", value: "", innerHTML: "", textContent: "", disabled: false, hidden: false, dataset: {}, children: [], attrs: {}, events: {}, isConnected: true,
    addEventListener(e, f) { this.events[e] = f; }, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
    appendChild(child) { if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(n => n !== child); this.children.push(child); child.parentNode = this; },
    insertBefore(child, before) { this.children.splice(this.children.indexOf(before), 0, child); child.parentNode = this; },
    matches(selector) { return selector === 'input[type="password"]' && this.tagName === "INPUT" && this.type === "password"; },
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); },
    querySelector() { return null; }, classList: { add() {}, remove() {}, toggle() { return true; } }, scrollIntoView() {} };
  return result;
}
function setup(file, options = {}) {
  const elements = new Map(), events = {}, windows = {}, observers = []; let user = options.guest ? null : { _id: "first", role: "admin", name: "Operator", email: "operator@example.test" };
  const el = key => { if (!elements.has(key)) elements.set(key, node()); return elements.get(key); };
  const scope = vm.createContext({ console, URL, URLSearchParams, crypto, setTimeout() {}, clearTimeout() {}, API_BASE_URL: "/api", history: { replaceState() {} }, document: { body: node("body"), hidden: false, getElementById: el, querySelectorAll: () => [], querySelector: () => null, createElement: node, addEventListener(e, fn) { (events[e] ||= []).push(fn); } }, window: { location: { pathname: options.pathname || "/index.html", search: options.search || "", hash: "", href: "", assign(v) { this.href = v; } }, addEventListener(e, fn) { (windows[e] ||= []).push(fn); }, dispatchEvent() {} }, MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} }, Guest: { current: options.noGuest ? null : { id: "guest-one", email: "buyer@example.test" }, changed() {} }, Api: { ready: Promise.resolve(), getUser: () => user, isLoggedIn: () => Boolean(user), isAdmin: () => user?.role === "admin", can: () => true }, confirm: () => true, prompt: () => "A valid store note", FormData: function (form) { return Object.entries(form.values || {}); }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  for (const f of ["js/layout.js", "js/management-common.js", ...(file ? [file] : [])]) vm.runInContext(read(f), scope);
  scope.refreshCartBadge = async () => {}; scope.loadAnnouncement = async () => {}; scope.renderFooter = () => {};
  return { scope, el, events, windows, observers, setUser(value) { user = value; } };
}
test("Header search stays idle for empty/whitespace and submits a trimmed category query", () => {
  const x = setup(null, { guest: true, noGuest: true }); x.scope.renderHeader("home");
  assert.equal(x.el("global-search-submit").disabled, true);
  x.el("global-search").value = "   "; x.el("global-search").events.input(); x.el("global-search-form").events.submit({ preventDefault() {} });
  assert.equal(x.scope.window.location.href, ""); assert.equal(x.el("global-search-submit").disabled, true);
  x.el("global-search").value = "  Home & Kitchen  "; x.el("global-search").events.input(); assert.equal(x.el("global-search-submit").disabled, false);
  x.el("global-search-form").events.submit({ preventDefault() {} }); assert.equal(x.scope.window.location.href, "products.html?keyword=Home%20%26%20Kitchen");
  x.el("global-search").value = ""; x.el("global-search").events.search(); assert.equal(x.el("global-search-submit").disabled, true);
});
test("Prefilled search is usable and visitors can find order recovery before a guest session exists", () => {
  const x = setup(null, { guest: true, noGuest: true, search: "?keyword=Books" }); x.scope.renderHeader();
  assert.equal(x.el("global-search").value, "Books"); assert.equal(x.el("global-search-submit").disabled, false);
  assert.match(x.el("site-header").innerHTML, /href="guest-orders.html">Track order/);
});
test("Escape closes the mobile menu and returns keyboard focus to its toggle", () => {
  const x = setup(null, { guest: true }); x.scope.renderHeader(); let focused = false, removed = false;
  x.el("mobile-toggle").focus = () => { focused = true; };
  x.el("header-menu").classList.remove = value => { removed = value === "open"; };
  x.el("mobile-toggle").events.click(); assert.equal(x.el("mobile-toggle").attrs["aria-expanded"], "true");
  x.el("header-menu").events.keydown({ key: "Escape" });
  assert.equal(x.el("mobile-toggle").attrs["aria-expanded"], "false"); assert.equal(focused, true); assert.equal(removed, true);
});
test("Password eye controls preserve values and distinguish their own field without submitting", () => {
  const x = setup(), parent = node(), first = node("input"), second = node("input");
  Object.assign(first, { id: "password", type: "password", value: "A typed password" }); Object.assign(second, { id: "confirmation", type: "password", value: "A confirmation" }); parent.appendChild(first); parent.appendChild(second);
  x.scope.enhancePasswordInputs(parent); const a = first.parentNode.children[1], b = second.parentNode.children[1];
  assert.equal(a.type, "button"); assert.equal(a.attrs["aria-controls"], "password"); assert.equal(b.attrs["aria-controls"], "confirmation");
  a.events.click({ preventDefault() {} }); assert.equal(first.type, "text"); assert.equal(first.value, "A typed password"); assert.equal(second.type, "password"); assert.equal(a.attrs["aria-label"], "Hide password"); assert.equal(a.attrs["aria-pressed"], "true");
  a.events.click({ preventDefault() {} }); assert.equal(first.type, "password"); assert.equal(a.attrs["aria-pressed"], "false"); x.scope.enhancePasswordInputs(parent); assert.equal(first.parentNode.children.length, 2);
});
test("Dynamically inserted password fields receive a control and are hidden when leaving the page", () => {
  const x = setup(); x.scope.enablePasswordVisibility(); const input = node("input"), parent = node(); input.type = "password"; input.id = "new-password"; parent.appendChild(input);
  x.observers[0]([{ addedNodes: [input] }]); const button = input.parentNode.children[1]; button.events.click({ preventDefault() {} }); assert.equal(input.type, "text");
  x.windows.pagehide.forEach(fn => fn()); assert.equal(input.type, "password"); assert.equal(button.attrs["aria-label"], "Show password");
});
test("Guest history always offers private tracking and its saved order identifier", () => {
  const x = setup("js/guest-orders.js"), html = x.scope.guestOrderHtml({ _id: id, status: "processing", paymentStatus: "pending", totalAmount: 200, createdAt: new Date().toISOString() });
  assert.match(html, /Track delivery/); assert.match(html, /order-tracking.html\?orderId=a+&guest=1/); assert.match(html, /Full Order ID/); assert.match(html, /Preparing/); assert.match(html, /aria-current="step"/); assert.doesNotMatch(html, /href="order-support.html/);
});
test("A cancelled order is not shown as currently progressing toward delivery", () => {
  const x = setup(); assert.match(x.scope.orderProgressHtml("cancelled"), /cancelled/); assert.doesNotMatch(x.scope.orderProgressHtml("cancelled"), /aria-current="step"/);
});
test("Guest linking stops between requests if the signed-in account changes", async () => {
  const x = setup("js/guest-orders.js"); x.scope.renderHeader = () => {}; x.scope.Api.get = async url => url.endsWith("/orders") ? [] : { items: [] }; await x.events.DOMContentLoaded.at(-1)();
  const calls = []; let finish; x.scope.Api.post = url => { calls.push(url); return new Promise(r => finish = r); };
  const pending = x.el("guest-claim").events.click({ currentTarget: x.el("guest-claim") }); x.setUser({ _id: "second", role: "user" }); finish({}); await pending;
  assert.deepEqual(calls, ["/guest/merge-cart"]); assert.equal(x.scope.Guest.current.id, "guest-one");
});
test("A stale guest history response does not render after the guest identity changes", async () => {
  const x = setup("js/guest-orders.js"); const pending = []; x.scope.Api.get = () => new Promise(r => pending.push(r)); const work = x.scope.loadGuestOrders(); x.scope.Guest.current = { id: "another-guest" };
  pending[0]([{ _id: id }]); pending[1]({ items: [] }); await work; assert.equal(x.el("guest-orders-root").innerHTML, "");
});
test("An explicit guest tracking view keeps guest access separate from a signed-in account", async () => {
  const x = setup(null, { pathname: "/order-tracking.html", search: "?orderId=" + id + "&guest=1" }); const requests = [];
  x.scope.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ _id: "member", role: "user", name: "Member", email: "member@example.test" }) }; };
  x.scope.AbortController = AbortController; x.scope.CustomEvent = class {}; x.scope.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  vm.runInContext(read("js/api.js"), x.scope); const api = vm.runInContext("Api", x.scope); await api.ready;
  await api.get("/orders/" + id + "/tracking"); assert.equal(requests.at(-1).options.headers["X-Norda-Guest"], "1"); assert.equal(requests.at(-1).options.headers["X-Norda-Guest-ID"], "guest-one");
  await api.get("/cart"); assert.equal(requests.at(-1).options.headers["X-Norda-Guest"], undefined);
  await api.get("/wishlist/ids"); assert.equal(requests.at(-1).options.headers["X-Norda-Guest"], undefined);
  await api.get("/auth/profile"); assert.equal(requests.at(-1).options.headers["X-Norda-Guest"], undefined);
  await api.get("/admin/operations"); assert.equal(requests.at(-1).options.headers["X-Norda-Guest"], undefined);
  assert.equal(x.scope.shoppingIdentity(), "guest-one"); assert.equal(x.scope.orderHistoryUrl(), "guest-orders.html");
});
test("Missing explicit guest access leads to recovery instead of selecting a different member", () => {
  const x = setup(null, { noGuest: true, pathname: "/order-tracking.html", search: "?guest=1" }); assert.equal(x.scope.shoppingIdentity(), undefined); assert.equal(x.scope.requireShopper(), false); assert.equal(x.scope.window.location.href, "guest-orders.html");
});
test("Admin order rows identify guest contacts and route warehouse work to parcel management", () => {
  const x = setup("admin/orders.js"), order = { _id: id, status: "processing", paymentStatus: "pending", paymentMethod: "cod", totalAmount: 200, items: [{ quantity: 1 }], createdAt: new Date().toISOString(), user: { name: "Alias", email: "alias@guest.norda.invalid" }, customerSnapshot: { isGuest: true, name: '<Guest "A">', email: "real@example.test" }, shippingAddress: { phone: "01712345678" }, fulfillmentManaged: true };
  const html = x.scope.orderRow(order); assert.match(html, /Guest checkout/); assert.match(html, /real@example.test/); assert.match(html, /&lt;Guest &quot;A&quot;&gt;/); assert.doesNotMatch(html, /guest.norda.invalid|data-cod-paid/); assert.match(html, /fulfillment.html\?orderId=/);
});
test("Dispatch from the orders queue opens the courier form without a premature status write", async () => {
  const x = setup("admin/orders.js"); vm.runInContext('ordersOwner="first"', x.scope); let writes = 0; x.scope.Api.put = async () => writes++;
  await x.scope.updateOrder({ value: "shipped", dataset: { transition: id } }); assert.equal(writes, 0); assert.equal(x.scope.window.location.href, "shipments.html?orderId=" + id + "&action=dispatch");
});
test("Admin order refreshes discard older filter results", async () => {
  const x = setup("admin/orders.js"); vm.runInContext('ordersOwner="first"', x.scope); const pending = []; x.scope.Api.get = () => new Promise(r => pending.push(r));
  const old = x.scope.loadOrders(), latest = x.scope.loadOrders(); pending[1]({ orders: [], page: 1, pages: 1 }); await latest; const html = x.el("orders-root").innerHTML; pending[0]({ orders: [{ _id: id }], page: 1, pages: 1 }); await old; assert.equal(x.el("orders-root").innerHTML, html);
});
test("A pending COD confirmation cannot write under a different signed-in account", async () => {
  const x = setup("admin/orders.js"); vm.runInContext('ordersOwner="first"', x.scope); let finish, writes = 0; x.scope.Api.get = () => new Promise(r => finish = r); x.scope.Api.put = async () => writes++;
  const button = { disabled: false, dataset: { codPaid: id } }, pending = x.scope.markCodPaid(button); x.setUser({ _id: "second" }); finish({ status: "processing" }); await pending; assert.equal(writes, 0);
});
test("Dispatch links select the required shipment action and warehouse orders have a clear next step", () => {
  const x = setup("admin/shipments.js", { pathname: "/admin/shipments.html", search: "?action=dispatch&orderId=" + id }), order = { _id: id, status: "processing", totalAmount: 200 }, data = { order, shipment: {}, events: [], total: 0 };
  assert.match(x.scope.shipmentDetailHtml(data), /value="shipped" selected/); const split = x.scope.shipmentDetailHtml({ ...data, order: { ...order, fulfillmentManaged: true } }); assert.match(split, /Manage warehouse parcels/); assert.doesNotMatch(split, /id="shipment-form"/);
});

test("Store staff sign-in accepts only local admin destinations and customer signup keeps its own dashboard", () => {
 const x = setup("js/auth.js");assert.equal(x.scope.safeNext("admin/orders.html"),"admin/orders.html");for(const bad of ["https://evil.example","//evil.example","../admin/orders.html","admin/../orders.html"])assert.equal(x.scope.safeNext(bad),"index.html");assert.equal(x.scope.authDestination({_id:"user",role:"user"},"admin/orders.html"),"dashboard.html");assert.equal(x.scope.authDestination({_id:"admin",role:"admin"},"admin/orders.html"),"admin/orders.html");assert.equal(x.scope.authDestination({_id:"staff",role:"staff",staffMfaRequired:true,mfaEnabled:false},"admin/orders.html"),"authenticator.html");
});

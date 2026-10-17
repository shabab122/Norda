const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = (file) => fs.readFileSync(path.join(__dirname, "../../client", file), "utf8");
const context = () => vm.createContext({
  console, URLSearchParams, setTimeout: () => 0,
  document: { addEventListener() {}, getElementById() { return null; } },
  window: { addEventListener() {}, location: { pathname: "/product-detail.html", search: "?id=example" } },
  Api: { getUser: () => null }, API_BASE_URL: "/api",
});
test("HTML escaping preserves quotation marks safely in names, URLs and form values", () => {
  const scope = context(); vm.runInContext(read("js/layout.js"), scope);
  const encoded = scope.escapeHtml('House "Rose" & <Road>');
  assert.equal(encoded, "House &quot;Rose&quot; &amp; &lt;Road&gt;");
  assert.equal(scope.resolveImage("javascript:alert(1)"), "");
  assert.equal(scope.resolveImage("/uploads/../secret"), "");
});
test("Product cards escape attributes and use real cart actions with stock gating", () => {
  const scope = context(); vm.runInContext(read("js/layout.js"), scope); vm.runInContext(read("js/products-render.js"), scope);
  const card = scope.productCardHtml({ _id: "product-id", name: 'A "quoted" product', price: 100, discountPrice: 80, stock: 0, category: { name: "Category" }, brand: "Brand", images: [] });
  assert.match(card, /A &quot;quoted&quot; product/); assert.match(card, /data-quick-cart="product-id" disabled/);
});
test("Checkout key persists for retries and changes with payment method", () => {
  const saved = new Map(); const scope = context();
  scope.sessionStorage = { getItem: (key) => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: (key) => saved.delete(key) };
  let counter = 0; scope.window.crypto = { randomUUID: () => "key-" + (++counter) };
  vm.runInContext(read("js/checkout.js"), scope);
  const first = scope.checkoutKey("cod"); assert.equal(scope.checkoutKey("cod"), first);
  assert.notEqual(scope.checkoutKey("sslcommerz"), first);
  scope.clearCheckoutKey(); assert.notEqual(scope.checkoutKey("cod"), first);
});
test("Every page references present scripts/styles/assets and has unique static IDs", () => {
  const root = path.join(__dirname, "../../client"); const pages = [];
  const walk = (directory) => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const filename = path.join(directory, entry.name); if (entry.isDirectory()) walk(filename); else if (entry.name.endsWith(".html")) pages.push(filename); } };
  walk(root);
  for (const page of pages) {
    const html = fs.readFileSync(page, "utf8");
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]); assert.equal(new Set(ids).size, ids.length, page);
    const resources = [...html.matchAll(/<(?:script|img|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
    for (const resource of resources) if (!/^https?:/.test(resource)) assert.ok(fs.existsSync(path.resolve(path.dirname(page), resource)), page + " → " + resource);
  }
});

test("Local development clients keep the same cookie hostname", () => {
  const scope = context();
  scope.window.location = { protocol: "http:", port: "5500", hostname: "127.0.0.1" };
  vm.runInContext(read("js/config.js"), scope);
  assert.equal(vm.runInContext("API_BASE_URL", scope), "http://127.0.0.1:5000/api");
});

function cartScope() {
  const scope = context(); const saved = new Map(); const writes = []; let user = null;
  scope.document.body = { dataset: {} };
  scope.sessionStorage = { getItem: (key) => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: (key) => saved.delete(key) };
  scope.Api = { ready: Promise.resolve(), getUser: () => user, isLoggedIn: () => !!user,
    setSession: (value) => { user = value; }, post: async (url, body) => { writes.push({ url, ...body }); return {}; } };
  vm.runInContext(read("js/layout.js"), scope);
  return { scope, saved, writes, setUser: (value) => { user = value; } };
}

test("A guest's selected quantity survives sign-in and is added exactly once", async () => {
  const { scope, saved, writes, setUser } = cartScope();
  const id = "1234567890abcdef12345678";
  assert.equal(await scope.addProductToCart(id, 4), false);
  assert.match(scope.window.location.href, /^login\.html\?next=product-detail/);
  assert.equal(writes.length, 0);
  setUser({ _id: "customer-one" });
  assert.equal(await scope.finishCartIntent(), true);
  assert.equal(await scope.finishCartIntent(), false);
  assert.deepEqual(writes, [{ url: "/cart", productId: id, quantity: 4 }]);
  assert.equal(JSON.parse(saved.get("norda_cart_notice")).type, "success");
});

test("Expired, malformed and invalid guest selections never reach the cart API", async () => {
  const { scope, saved, writes, setUser } = cartScope(); setUser({ _id: "customer-one" });
  for (const intent of [null, { productId: "bad", quantity: 1, createdAt: Date.now() },
    { productId: "1234567890abcdef12345678", quantity: 1.5, createdAt: Date.now() },
    { productId: "1234567890abcdef12345678", quantity: 1, createdAt: Date.now() - 16 * 60 * 1000 },
    { productId: "1234567890abcdef12345678", quantity: 1, createdAt: Date.now() + 60000 }]) {
    saved.set("norda_pending_cart", JSON.stringify(intent)); assert.equal(await scope.finishCartIntent(), false);
    assert.equal(saved.has("norda_pending_cart"), false);
  }
  await assert.rejects(scope.addProductToCart("1234567890abcdef12345678", 0), /whole-number/);
  assert.equal(writes.length, 0);
});

test("Cart writes serialize and a failed request does not poison later changes", async () => {
  const { scope, setUser } = cartScope(); setUser({ _id: "customer-one" });
  const events = []; let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = scope.enqueueCartWrite(async () => { events.push("first-start"); await gate; events.push("first-end"); throw new Error("rejected"); });
  const firstRejected = assert.rejects(first, /rejected/);
  const second = scope.enqueueCartWrite(async () => { events.push("second"); return 2; });
  await Promise.resolve(); assert.deepEqual(events, ["first-start"]);
  release(); await firstRejected; assert.equal(await second, 2);
  assert.deepEqual(events, ["first-start", "first-end", "second"]);
});

test("Queued cart changes stop if the signed-in account changes", async () => {
  const { scope, setUser } = cartScope(); setUser({ _id: "customer-one" });
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const first = scope.enqueueCartWrite(() => gate); await Promise.resolve();
  const second = scope.enqueueCartWrite(() => { throw new Error("must not execute"); });
  const rejected = assert.rejects(second, /account changed/);
  setUser({ _id: "customer-two" }); release(); await first; await rejected;
});

test("Failed sign-in cart completion reports the error and never retries the item automatically", async () => {
  const { scope, saved, setUser } = cartScope(); setUser({ _id: "customer-one" }); let attempts = 0;
  scope.Api.post = async () => { attempts++; throw new Error("This product is sold out."); };
  scope.rememberCartIntent("1234567890abcdef12345678", 1);
  assert.equal(await scope.finishCartIntent(), true); assert.equal(await scope.finishCartIntent(), false);
  assert.equal(attempts, 1); const notice = JSON.parse(saved.get("norda_cart_notice"));
  assert.equal(notice.type, "warning"); assert.match(notice.message, /sold out/);
});

for (const mode of ["login", "register"]) {
  test(`${mode} keeps the selected product, quantity and safe return destination`, async () => {
    const { scope, writes } = cartScope(); let ready; let submit;
    scope.window.location.search = "?next=" + encodeURIComponent("product-detail.html?id=1234567890abcdef12345678");
    scope.document.addEventListener = (event, callback) => { if (event === "DOMContentLoaded") ready = callback; };
    const link = { getAttribute: () => mode === "login" ? "register.html" : "login.html" };
    scope.document.querySelectorAll = () => [link];
    const button = { disabled: false }; const form = { addEventListener: (event, callback) => { submit = callback; } };
    const fields = { [`${mode}-form`]: form, name: { value: "Test customer" }, email: { value: "customer@norda.example" }, password: { value: "TestPassword123" } };
    scope.document.getElementById = (id) => fields[id] || null;
    scope.renderHeader = () => {}; scope.renderFooter = () => {}; scope.setTimeout = (callback) => callback();
    const write = scope.Api.post;
    scope.Api.post = async (url, body) => url.startsWith("/auth/") ? { _id: "customer-one", role: "customer" } : write(url, body);
    scope.rememberCartIntent("1234567890abcdef12345678", 2);
    vm.runInContext(read("js/auth.js"), scope); await ready();
    assert.match(link.href, /next=product-detail/);
    assert.equal(scope.safeNext("https://untrusted.example"), "index.html");
    assert.equal(scope.safeNext("//untrusted.example"), "index.html");
    await submit({ preventDefault() {}, currentTarget: { querySelector: () => button } });
    assert.equal(scope.window.location.href, "cart.html");
    assert.deepEqual(writes, [{ url: "/cart", productId: "1234567890abcdef12345678", quantity: 2 }]);
  });
}

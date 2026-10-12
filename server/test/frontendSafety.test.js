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

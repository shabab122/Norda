const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const client = path.join(__dirname, "../../client");
const read = (name) => fs.readFileSync(path.join(client, name), "utf8");
function setup() {
  const events = {}; const elements = {}; const saved = new Map();
  const element = () => ({ innerHTML: "", textContent: "", disabled: false, value: "", addEventListener(type, handler) { this[type] = handler; }, scrollIntoView() {}, querySelectorAll: () => [] });
  const get = (id) => elements[id] ||= element();
  const scope = vm.createContext({ URLSearchParams, console, setTimeout() {},
    document: { body: { dataset: {} }, addEventListener(type, handler) { events[type] = handler; }, getElementById: get, querySelectorAll: () => [] },
    window: { location: { search: "", pathname: "/checkout.html", assign(value) { this.href = value; } }, addEventListener() {}, crypto: { randomUUID: crypto.randomUUID } },
    sessionStorage: { getItem: (key) => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: (key) => saved.delete(key) },
    API_BASE_URL: "/api", Api: { ready: Promise.resolve(), getUser: () => ({ _id: "buyer" }), isLoggedIn: () => true },
  });
  vm.runInContext(read("js/layout.js"), scope);
  return { scope, elements, events, get };
}
test("Checkout renders distinct demo options without merchant configuration and keeps COD", async () => {
  const { scope, get } = setup(); vm.runInContext(read("js/checkout.js"), scope);
  scope.bindCheckoutForm = () => {};
  scope.Api.get = async (route) => route === "/cart" ? { items: [{ product: { _id: "p", name: "Notebook", stock: 2 }, quantity: 1, price: 650 }] } : route === "/auth/profile" ? { address: {} } : { demoEnabled: true, sslcommerzEnabled: false };
  scope.getStoreConfig = async () => ({ freeShippingThreshold: 5000, flatShippingFee: 120 });
  await scope.loadCheckout();
  const html = get("checkout-root").innerHTML;
  assert.match(html, /value="demo_mobile_banking" checked/); assert.match(html, /value="demo_card_bank"/); assert.match(html, /value="cod"/);
  assert.match(html, /no money is transferred/i); assert.doesNotMatch(html, /value="sslcommerz"|Online payment is currently unavailable/);
});
for (const method of ["demo_mobile_banking", "demo_card_bank", "sslcommerz", "cod"]) {
  test("Checkout submits the correct endpoint and retry key for " + method, async () => {
    const { scope, get } = setup(); vm.runInContext(read("js/checkout.js"), scope);
    scope.document.querySelector = () => ({ value: method });
    const writes = []; scope.Api.post = async (url, body) => { writes.push({ url, body }); return { checkoutUrl: "demo-payment.html?orderId=example", _id: "placed-order", invoiceNumber: "invoice" }; };
    for (const [id, value] of Object.entries({ "address-line": "Road", "address-line-2": "", city: "Dhaka", district: "Dhaka", postcode: "1207", country: "Bangladesh", phone: "01712345678" })) get(id).value = value;
    scope.bindCheckoutForm(); await get("checkout-form").submit({ preventDefault() {} });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].url, method.startsWith("demo_") ? "/payments/demo/initiate" : method === "sslcommerz" ? "/payments/sslcommerz/initiate" : "/orders");
    assert.ok(writes[0].body.checkoutKey); assert.equal(writes[0].body.shippingAddress.city, "Dhaka");
    if (method.startsWith("demo_")) { assert.equal(writes[0].body.channel, method.slice(5)); assert.match(scope.window.location.href, /demo-payment/); }
    await get("checkout-form").submit({ preventDefault() {} }); assert.equal(writes.length, 1);
  });
}
test("Demo pages do not collect payment secrets and label both channels and completed sessions", () => {
  const { scope } = setup(); vm.runInContext(read("js/demo-payment.js"), scope);
  for (const channel of ["mobile_banking", "card_bank"]) {
    const session = { channel, orderId: "1234567890abcdef12345678", invoiceNumber: '<Invoice "test">', amount: 770, currency: "BDT", status: "initiated", orderStatus: "pending" };
    const html = scope.demoPaymentHtml(session);
    assert.match(html, /Test environment/); assert.match(html, /payment is simulated/); assert.doesNotMatch(html.replace(/<[^>]*>/g, " "), /\bdemo\b/i); assert.doesNotMatch(html, /<(input|textarea|form)\b/);
    for (const outcome of ["success", "failure", "cancel"]) assert.match(html, new RegExp('data-demo-outcome="' + outcome + '"'));
    assert.match(html, /&lt;Invoice &quot;test&quot;&gt;/);
    assert.doesNotMatch(scope.demoPaymentHtml({ ...session, status: "paid" }), /data-demo-outcome/);
    assert.doesNotMatch(scope.demoPaymentHtml({ ...session, orderStatus: "cancelled" }), /data-demo-outcome/);
  }
});
test("Home sections exclude the same product and repeated covers, preserving newest order", async () => {
  const { scope, get } = setup(); vm.runInContext(read("js/home.js"), scope);
  const product = (id, image = id) => ({ _id: id, images: [image + ".webp"] });
  const featured = [product("a"), product("a"), product("b"), product("duplicate-cover", "b")];
  const newest = [product("a"), product("c"), product("d", "b"), product("e"), product("e")];
  scope.productCardHtml = (item) => `<article>${item._id}</article>`;
  scope.Api.get = async (url) => ({ products: url.includes("featured") ? featured : newest });
  await scope.loadHomeProducts();
  assert.equal(get("featured-grid").innerHTML, "<article>a</article><article>b</article>");
  assert.equal(get("new-grid").innerHTML, "<article>c</article><article>e</article>");
  scope.Api.get = async (url) => { if (url.includes("featured")) throw new Error("Offline"); return { products: newest }; };
  await scope.loadHomeProducts(); assert.match(get("featured-grid").innerHTML, /could not be loaded/); assert.match(get("new-grid").innerHTML, /<article>a/);
});
test("All 24 seeded product cover photos are present, distinct and WebP images", () => {
  const catalog = require("../seed/catalog");
  const covers = catalog.products.map((product) => product.images[0]);
  assert.equal(covers.length, 24); assert.equal(new Set(covers).size, 24);
  const hashes = covers.map((cover) => {
    const data = fs.readFileSync(path.join(client, cover));
    assert.equal(data.subarray(0, 4).toString(), "RIFF"); assert.equal(data.subarray(8, 12).toString(), "WEBP");
    return crypto.createHash("sha256").update(data).digest("hex");
  });
  assert.equal(new Set(hashes).size, 24);
});

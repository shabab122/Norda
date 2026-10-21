const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const read = (name) => fs.readFileSync(path.join(__dirname, "../../client", name), "utf8");
const id = "a".repeat(24), variantId = "b".repeat(24);
const setup = (name, admin = false) => {
  let user = { _id: "customer-one", role: admin ? "admin" : "user" };
  const elements = new Map(), storage = new Map();
  const get = (key) => { if (!elements.has(key)) elements.set(key, { innerHTML: "", textContent: "", value: "", checked: false, disabled: false, dataset: {}, setAttribute() {}, addEventListener(type, fn) { this[type] = fn; }, querySelectorAll: () => [], querySelector: () => null }); return elements.get(key); };
  const scope = vm.createContext({ console, URL, URLSearchParams, crypto, setTimeout() {},
    sessionStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    document: { body: { dataset: {} }, addEventListener() {}, getElementById: get, querySelectorAll: () => [], querySelector: () => null },
    window: { addEventListener() {}, location: { pathname: "/" + name, search: "?orderId=" + id, hash: "" } },
    Api: { ready: Promise.resolve(), getUser: () => user, isLoggedIn: () => Boolean(user), isAdmin: () => user?.role === "admin" }, API_BASE_URL: "/api",
  });
  vm.runInContext(read("js/layout.js"), scope); vm.runInContext(read(name), scope);
  return { scope, get, storage, setUser: (value) => { user = value; } };
};
test("Variant cards require choosing an option instead of adding an unspecified SKU", () => {
  const { scope } = setup("js/products-render.js");
  const html = scope.productCardHtml({ _id: id, name: 'Shirt "Forest"', hasVariants: true, variants: [], stock: 5, price: 1000, images: [] });
  assert.match(html, /Choose options/); assert.match(html, /From/); assert.doesNotMatch(html, /data-quick-cart/); assert.match(html, /&quot;Forest&quot;/);
});
test("Guest option and quantity survive sign-in once and malformed options never reach the cart", async () => {
  const { scope, setUser, storage } = setup("js/products-render.js"), calls = []; setUser(null);
  scope.Api.post = async (url, body) => calls.push({ url, ...body });
  assert.equal(await scope.addProductToCart(id, 2, variantId), false); setUser({ _id: "buyer" }); await scope.finishCartIntent(); assert.equal(await scope.finishCartIntent(), false);
  assert.equal(calls.length, 1); assert.equal(calls[0].variantId, variantId); assert.equal(calls[0].quantity, 2);
  storage.set("norda_pending_cart", JSON.stringify({ productId: id, variantId: "invalid", quantity: 1, createdAt: Date.now() })); assert.equal(await scope.finishCartIntent(), false); assert.equal(calls.length, 1);
});
test("Option picker updates price, photo, SKU and quantity ceiling from the selected variant", () => {
  const { scope, get } = setup("js/product-detail.js");
  const product = { price: 500, images: [], variants: [{ _id: variantId, sku: "NOR-BLACK-M", size: "M", color: "Black", price: 1200, discountPrice: 900, stock: 2, images: ["/uploads/black.webp"] }] };
  scope.bindVariantSelection(product); assert.equal(get("add-to-cart-btn").disabled, true);
  get("pd-variant").value = variantId; get("pd-variant").change(); assert.equal(get("add-to-cart-btn").disabled, false); assert.equal(get("qty-input").max, "2"); assert.match(get("pd-price").innerHTML, /900/); assert.match(get("pd-variant-info").textContent, /NOR-BLACK-M/); assert.match(get("main-product-image").src, /black.webp/);
  get("pd-variant").value = ""; get("pd-variant").change(); assert.equal(get("add-to-cart-btn").disabled, true); assert.match(get("pd-stock").textContent, /Choose/);
});
test("Cart controls use selected SKU stock rather than the product's combined stock", () => {
  const { scope } = setup("js/cart.js"); const html = scope.cartRow({ _id: id, variantId, sku: "NOR-BLACK-M", size: "M", color: "Black", stock: 2, price: 900, quantity: 2, product: { _id: id, name: "Shirt", stock: 99, images: [] } });
  assert.match(html, /data-stock="2"/); assert.match(html, /max="2"/); assert.match(html, /NOR-BLACK-M/); assert.match(html, /qty-increase[^>]*disabled/);
});
test("Invoice displays immutable SKU/option labels with safe escaping", () => {
  const { scope, get } = setup("js/invoice.js");
  scope.renderInvoice({ invoiceNumber: "NOR-SKU", issuedAt: new Date().toISOString(), totalAmount: 1000, subtotal: 1000, shippingFee: 0, paymentStatus: "paid", items: [{ name: "Shirt", variantId, sku: "NOR-M", size: '<M "size">', color: "Black", quantity: 1, unitPrice: 1000, lineTotal: 1000 }], order: { status: "delivered", paymentMethod: "cod" } });
  assert.match(get("invoice-root").innerHTML, /NOR-M/); assert.match(get("invoice-root").innerHTML, /&lt;M &quot;size&quot;&gt;/); assert.doesNotMatch(get("invoice-root").innerHTML, /<M /);
});
test("Customer tracking escapes shipment notes and rejects active or credentialed links", () => {
  const { scope } = setup("js/order-tracking.js");
  const html = scope.trackingHtml({ order: { _id: id, status: "shipped" }, shipment: { state: "in_transit", courierName: '<Courier "One">', trackingUrl: "javascript:bad" }, events: [{ event: "in_transit", note: "<script>bad</script>", createdAt: new Date().toISOString() }], page: 1, pages: 1 });
  assert.match(html, /&lt;Courier &quot;One&quot;&gt;/); assert.match(html, /&lt;script&gt;bad/); assert.doesNotMatch(html, /href="javascript|<script>/); assert.equal(scope.safeCourierLink("https://user:secret@courier.example"), ""); assert.ok(scope.safeCourierLink("https://courier.example/track"));
});
test("Tracking responses from a previous account cannot render private order data", async () => {
  const { scope, get, setUser } = setup("js/order-tracking.js"); let finish;
  scope.Api.get = () => new Promise((resolve) => { finish = resolve; }); const pending = scope.loadTracking(); setUser({ _id: "customer-two" }); finish({ order: { _id: id, status: "shipped" }, shipment: {}, events: [] }); await pending; assert.equal(get("tracking-root").innerHTML, "");
});
test("Administrator shipment form identifies public notes and closes delivered updates", () => {
  const { scope } = setup("admin/shipments.js", true);
  const open = scope.shipmentDetailHtml({ order: { _id: id, status: "processing" }, shipment: { courierName: '<Name "courier">' }, events: [] }); assert.match(open, /Customer-visible update/); assert.match(open, /Dispatch order/); assert.match(open, /&lt;Name &quot;courier&quot;&gt;/);
  assert.doesNotMatch(scope.shipmentDetailHtml({ order: { _id: id, status: "delivered" }, shipment: {}, events: [] }), /id="shipment-form"/);
});
test("Shipment writes block double-clicks and retain the same intent after a timeout", async () => {
  const { scope, get, storage } = setup("admin/shipments.js", true), calls = [], button = { disabled: false }, body = { courierName: "Courier", trackingNumber: "T123", trackingUrl: "https://courier.example", event: "shipped", location: "Dhaka", note: "Parcel accepted" };
  const form = { reportValidity: () => true, elements: Object.fromEntries(Object.entries(body).map(([key, value]) => [key, { value }])), querySelector: () => button }, event = { preventDefault() {}, currentTarget: form };
  let fail; scope.Api.post = (url, payload) => { calls.push({ url, payload }); return new Promise((resolve, reject) => { fail = reject; }); };
  const first = scope.saveShipment(event); await scope.saveShipment(event); assert.equal(calls.length, 1); fail(new Error("Timeout")); await first;
  scope.Api.post = async (url, payload) => { calls.push({ url, payload }); throw new Error("Timeout"); }; await scope.saveShipment(event); assert.equal(calls[0].payload.requestKey, calls[1].payload.requestKey); assert.equal(storage.size, 1);
  form.elements.note.value = "Another note"; await scope.saveShipment(event); assert.equal(calls.length, 2); assert.match(get("shipment-alert").textContent, /uncertain/);
});
test("Email workspace escapes delivery errors and distinguishes saved preview from SMTP delivery", () => {
  const { scope } = setup("admin/notifications.js", true); const html = scope.notificationListHtml({ items: [{ _id: id, order: id, subject: '<Order "One">', to: "buyer@example.com", status: "sent", transport: "file", attempts: 1, lastError: "<unsafe>" }], page: 1, pages: 1, total: 1 });
  assert.match(html, /Saved preview/); assert.match(html, /&lt;Order &quot;One&quot;&gt;/); assert.match(html, /&lt;unsafe&gt;/); assert.doesNotMatch(html, /<unsafe>/);
});

test("A partial variant photo upload failure retains successful uploads and retries only the remaining file", async () => {
  const { scope, get } = setup("admin/variants.js", true); get("product-variants-enabled").checked = true;
  const files = [{ type: "image/webp", size: 100, name: "one.webp" }, { type: "image/webp", size: 100, name: "two.webp" }], draft = [{ sku: "NOR-M", size: "M", color: "", price: 100, stock: 2, images: [], files: [...files] }];
  let renders = 0, count = 0; scope.FormData = class { append() {} }; scope.readVariantEditor = () => draft; scope.renderVariantEditor = () => { renders++; }; scope.syncVariantMode = () => {};
  scope.Api.post = async () => { count++; if (count === 2) throw new Error("Upload interrupted"); return { url: "/uploads/" + count + ".webp" }; };
  await assert.rejects(scope.variantPayload(), /interrupted/); assert.equal(draft[0].images.length, 1); assert.equal(draft[0].files.length, 1); assert.equal(renders, 1);
  const result = await scope.variantPayload(); assert.equal(count, 3); assert.equal(result[0].images.length, 2); assert.equal(result[0].files, undefined); assert.equal(renders, 2);
});

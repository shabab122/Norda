const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const read = (name) => fs.readFileSync(path.join(__dirname, "../../client", name), "utf8");
const setup = (file) => {
  let user = { _id: "customer-one", role: "user" }; const nodes = new Map(), storage = new Map();
  const get = (id) => { if (!nodes.has(id)) nodes.set(id, { innerHTML: "", textContent: "", value: "", hidden: false, disabled: false, dataset: {}, classList: { contains: () => false, toggle() {} }, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, addEventListener(k, fn) { this[k] = fn; }, querySelectorAll: () => [] }); return nodes.get(id); };
  const scope = vm.createContext({ console, URL, URLSearchParams, crypto, setTimeout() {},
    location: { search: "", hash: "" }, document: { body: { dataset: {} }, addEventListener() {}, getElementById: get, querySelectorAll: () => [] },
    window: { location: { search: "" }, addEventListener() {}, dispatchEvent() {} },
    sessionStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) }, API_BASE_URL: "/api",
    Api: { ready: Promise.resolve(), getUser: () => user, isLoggedIn: () => Boolean(user) },
  });
  vm.runInContext(read("js/layout.js"), scope); if (file) vm.runInContext(read(file), scope);
  return { scope, get, storage, setUser: (value) => user = value };
};
test("Published FAQ/policy/contact values render as text and unsafe banner links stay unusable", () => {
  const { scope } = setup("js/store-help.js");
  const html = scope.renderStoreHelp({ supportEmail: "support@example.com", address: '<Address "one">', faq: [{ question: "<script>question</script>", answer: '<img src=x onerror="bad">' }], policies: { returns: '<Return "text">' } });
  assert.match(html, /&lt;Address &quot;one&quot;&gt;/); assert.match(html, /&lt;script&gt;question/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.equal(scope.safeStoreLink("javascript:bad"), ""); assert.equal(scope.safeStoreLink("https://u:p@example.com"), ""); assert.equal(scope.safeStoreLink("/coupons.html"), "/coupons.html");
});
test("Banner content updates DOM text and keeps the existing hero hidden when disabled", () => {
  const { scope, get } = setup();
  scope.applyStoreHero({ visible: false, eyebrow: "New", title: "<Fresh>", description: "Description", buttonLabel: "Explore", buttonUrl: "/products.html", imageUrl: "/assets/norda-hero-v2.png" });
  assert.equal(get("home-hero").hidden, true); assert.equal(get("hero-title").textContent, "<Fresh>"); assert.equal(get("home-hero-button").href, "/products.html");
});
test("Coupon application uses server totals, changes the checkout key and removes the discount cleanly", async () => {
  const { scope, get } = setup("js/checkout.js"); vm.runInContext('checkoutOwner="customer-one";checkoutCartSignature="cart";checkoutSignature="cart"', scope);
  const old = scope.checkoutKey("cod"); scope.Api.post = async () => ({ coupon: { code: "SAVE10" }, cartSignature: "cart", subtotal: 1000, discountAmount: 100, shippingFee: 120, totalAmount: 1020 });
  await scope.updateCheckoutCoupon("save10"); assert.equal(get("checkout-total").textContent, "৳1,020"); assert.equal(get("checkout-discount-row").hidden, false); assert.notEqual(scope.checkoutKey("cod"), old);
  scope.Api.post = async () => ({ coupon: null, cartSignature: "cart", subtotal: 1000, discountAmount: 0, shippingFee: 120, totalAmount: 1120 }); await scope.updateCheckoutCoupon(""); assert.equal(get("checkout-discount-row").hidden, true); assert.equal(get("checkout-total").textContent, "৳1,120");
});
test("A coupon preview cannot double submit or replace a quote after an account/cart change", async () => {
  const { scope, get, setUser } = setup("js/checkout.js"); vm.runInContext('checkoutOwner="customer-one";checkoutCartSignature="cart"', scope); let finish, calls = 0;
  scope.Api.post = () => { calls++; return new Promise((r) => finish = r); };
  const pending = scope.updateCheckoutCoupon("SAVE10"); await scope.updateCheckoutCoupon("OTHER"); assert.equal(calls, 1); assert.equal(get("place-order-btn").disabled, true);
  setUser({ _id: "another" }); finish({ coupon: { code: "SAVE10" }, cartSignature: "cart" }); await pending; assert.equal(get("checkout-total").textContent, "");
  setUser({ _id: "customer-one" }); scope.Api.post = async () => ({ cartSignature: "changed" }); await scope.updateCheckoutCoupon("SAVE10"); assert.match(get("coupon-feedback").textContent, /cart or prices changed/);
});
test("Wishlist responses from a previous account never render its products", async () => {
  const { scope, get, setUser } = setup("js/wishlist.js"); vm.runInContext('wishlistOwner="customer-one"', scope); let finish;
  scope.Api.get = () => new Promise((r) => finish = r); const pending = scope.loadWishlist(); setUser({ _id: "another" }); finish({ items: [{ product: { name: "Private" } }], pages: 1 }); await pending; assert.equal(get("tools-root").innerHTML, "");
});
test("An older wishlist ID response cannot replace a newer refresh", async () => {
  const { scope } = setup(); const finish = [];
  scope.Api.get = () => new Promise((r) => finish.push(r)); const first = scope.refreshWishlistButtons(true), second = scope.refreshWishlistButtons(true);
  finish[1](["new-product"]); await second; finish[0](["old-product"]); await first;
  assert.equal(vm.runInContext('savedWishlistIds.has("new-product")', scope), true); assert.equal(vm.runInContext('savedWishlistIds.has("old-product")', scope), false);
});
test("Inventory import keys survive retry and are distinct for another file/account", () => {
  const { scope, storage } = setup("admin/inventory.js"); vm.runInContext('inventoryOwner="admin-one"', scope);
  const key = scope.inventoryImportKey("hash-one"); assert.equal(scope.inventoryImportKey("hash-one"), key); assert.notEqual(scope.inventoryImportKey("hash-two"), key); vm.runInContext('inventoryOwner="admin-two"', scope); assert.notEqual(scope.inventoryImportKey("hash-one"), key); assert.equal(storage.size, 3);
});
test("Inventory previews and partial results escape product names and explain conflicts", () => {
  const { scope } = setup("admin/inventory.js");
  const html = scope.renderStockPreview({ valid: true, rowCount: 1, productCount: 1, results: [], changes: [{ name: '<Shirt "one">', sku: "<SKU>", from: 1, to: 3, lowStockThreshold: 2 }] }); assert.match(html, /&lt;Shirt &quot;one&quot;&gt;/); assert.doesNotMatch(html, /<SKU>/);
  const result = scope.renderStockResult({ entries: [{ name: "One", status: "applied", message: "Updated" }, { name: "Two", status: "conflict", message: "<Stock changed>" }] }); assert.match(result, /1 of 2/); assert.match(result, /&lt;Stock changed&gt;/);
});
test("Invoice printing displays the recorded coupon and discounted total safely", () => {
  const { scope, get } = setup("js/invoice.js");
  scope.renderInvoice({ invoiceNumber: "NOR-TEST", issuedAt: new Date(), paymentStatus: "pending", subtotal: 1000, discountAmount: 100, coupon: { code: '<SAVE "10">' }, shippingFee: 120, totalAmount: 1020, items: [], order: { status: "pending" } });
  assert.match(get("invoice-root").innerHTML, /Coupon &lt;SAVE &quot;10&quot;&gt;/); assert.match(get("invoice-root").innerHTML, /−৳100/); assert.match(get("invoice-root").innerHTML, /৳1,020/);
});

test("Customer order totals explain the coupon saving without changing legacy orders", () => {
  const { scope } = setup("js/orders.js");
  const base = { _id: "a".repeat(24), createdAt: new Date(), status: "pending", paymentStatus: "pending", paymentMethod: "cod", subtotal: 1000, shippingFee: 120, totalAmount: 1020, items: [], shippingAddress: {} };
  const html = scope.renderOrder({ ...base, discountAmount: 100, coupon: { code: '<SAVE10>' } });
  assert.match(html, /Coupon &lt;SAVE10&gt;/); assert.match(html, /−৳100/); assert.doesNotMatch(scope.renderOrder(base), /Coupon /);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const uri = process.env.NORDA_TEST_MONGO_URI;

test("Real MongoDB HTTP: catalog, authentication, cart, checkout, inventory and permissions", { skip: !uri, timeout: 90000 }, async (t) => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.NODE_ENV = "test";
  const dbName = "norda_test_" + crypto.randomBytes(8).toString("hex");
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const Product = require("../models/Product"); const Category = require("../models/Category");
  const User = require("../models/User"); const Cart = require("../models/Cart");
  const Order = require("../models/Order"); const Invoice = require("../models/Invoice");
  const Brand = require("../models/Brand"); const Lock = require("../models/OperationLock");
  const { seedCatalog } = require("../seed/seedCatalog");
  const catalog = require("../seed/catalog");
  const { calculateTotals, createOrderFromCart } = require("../services/orderService");
  const { supportsTransactions } = require("../services/databaseUnit");
  const app = require("../app");
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  const transactions = await supportsTransactions();
  if (process.env.NORDA_EXPECT_TRANSACTIONS !== undefined) assert.equal(transactions, process.env.NORDA_EXPECT_TRANSACTIONS === "1");
  t.diagnostic("Native MongoDB; transaction path: " + transactions);
  const listener = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => listener.once("listening", resolve));
  const base = "http://127.0.0.1:" + listener.address().port;
  const uploads = [];
  const request = async (url, options = {}) => {
    const headers = {};
    if (options.cookie) headers.Cookie = options.cookie;
    const isForm = options.body instanceof FormData;
    if (options.body !== undefined && !isForm) headers["Content-Type"] = "application/json";
    const response = await fetch(base + url, { method: options.method || "GET", headers, body: options.body === undefined ? undefined : isForm ? options.body : JSON.stringify(options.body) });
    const data = (response.headers.get("content-type") || "").includes("json") ? await response.json() : await response.text();
    return { status: response.status, data, cookie: (response.headers.get("set-cookie") || "").split(";")[0] };
  };
  const address = { line1: "Native Test Road", city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678" };
  let customer; let adminCookie; let customerCookie; let otherCookie; let productId; let orderId; let invoiceId;
  try {
    await t.test("Catalog seed adds 24 products/12 categories, migrates starter art and preserves merchant edits", async () => {
      const category = await Category.create({ name: "Electronics", slug: "electronics", image: "/assets/products/headphones.svg" });
      const legacy = await Product.create({ name: catalog.products[0].name, slug: "wireless-bluetooth-headphones", category: category._id, price: 1234, stock: 7, brand: "SoundMax", images: ["/assets/products/headphones.svg"] });
      const seeded = await seedCatalog(); assert.equal(seeded.created, 23);
      assert.equal(await Product.countDocuments(), 24); assert.equal(await Category.countDocuments(), 12);
      let current = await Product.findById(legacy._id); assert.equal(current.price, 1234); assert.equal(current.stock, 7); assert.match(current.images[0], /photos\/headphones.webp$/);
      await Product.updateOne({ _id: legacy._id }, { $set: { stock: 5, images: ["/uploads/merchant-photo.jpg"] } });
      assert.equal((await seedCatalog()).created, 0);
      current = await Product.findById(legacy._id); assert.equal(current.stock, 5); assert.equal(current.images[0], "/uploads/merchant-photo.jpg");
      await Product.updateOne({ _id: legacy._id }, { $set: { images: catalog.products[0].images } });
      productId = legacy._id.toString();
    });
    await t.test("Anonymous visitors browse every category and all AI photos through the real HTTP app", async () => {
      const categories = await request("/api/categories"); assert.equal(categories.data.length, 12);
      for (const category of categories.data) {
        const page = await request("/api/products?category=" + category._id); assert.equal(page.status, 200); assert.equal(page.data.total, 2);
      }
      for (const item of catalog.products) { const photo = await fetch(base + item.images[0]); assert.equal(photo.status, 200, item.name); assert.match(photo.headers.get("content-type"), /image\/webp/); await photo.arrayBuffer(); }
      const sorted = await request("/api/products?sort=price_asc&limit=100");
      const prices = sorted.data.products.map((item) => item.effectivePrice); assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
      assert.equal((await request("/api/cart")).status, 401);
    });
    await t.test("Real password login/cookies restore accounts, preserve carts and enforce admin permissions", async () => {
      await User.create({ name: "Native admin", email: "admin@norda-test.example", password: "NativeAdminPassword123", role: "admin" });
      const admin = await request("/api/auth/login", { method: "POST", body: { email: "admin@norda-test.example", password: "NativeAdminPassword123" } }); assert.equal(admin.status, 200); adminCookie = admin.cookie;
      const registered = await request("/api/auth/register", { method: "POST", body: { name: "Native customer", email: "customer@norda-test.example", password: "NativeCustomer123" } }); assert.equal(registered.status, 201); customerCookie = registered.cookie; customer = registered.data;
      const other = await request("/api/auth/register", { method: "POST", body: { name: "Another customer", email: "other@norda-test.example", password: "OtherCustomer123" } }); otherCookie = other.cookie;
      assert.equal((await request("/api/auth/profile", { cookie: customerCookie })).data.email, customer.email);
      assert.equal((await request("/api/admin/dashboard-summary", { cookie: customerCookie })).status, 403);
      assert.equal((await request("/api/auth/login", { method: "POST", body: { email: customer.email, password: "wrong" } })).status, 401);
      await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId, quantity: 1 } });
      const oldCookie = customerCookie; await request("/api/auth/logout", { method: "POST", cookie: customerCookie });
      assert.equal((await request("/api/cart", { cookie: oldCookie })).status, 401);
      const login = await request("/api/auth/login", { method: "POST", body: { email: customer.email, password: "NativeCustomer123" } }); customerCookie = login.cookie;
      assert.equal((await request("/api/cart", { cookie: customerCookie })).data.items.length, 1);
      await request("/api/cart", { method: "DELETE", cookie: customerCookie });
    });
    await t.test("Every available category can be added; quantity, remove, reprice and stock errors work", async () => {
      const products = (await request("/api/products?limit=100")).data.products;
      for (const product of products) {
        const result = await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId: product._id, quantity: 1 } });
        assert.equal(result.status, product.stock ? 201 : 409, product.name);
      }
      let cart = (await request("/api/cart", { cookie: customerCookie })).data; assert.equal(cart.items.length, 23);
      const first = cart.items.find((item) => item.product._id === productId);
      assert.equal((await request("/api/cart/" + first._id, { method: "PUT", cookie: customerCookie, body: { quantity: 1.5 } })).status, 400);
      assert.equal((await request("/api/cart/" + first._id, { method: "PUT", cookie: customerCookie, body: { quantity: 99999 } })).status, 409);
      assert.equal((await request("/api/cart/" + first._id, { method: "PUT", cookie: customerCookie, body: { quantity: 2 } })).status, 200);
      assert.equal((await request("/api/cart/" + first._id, { method: "DELETE", cookie: customerCookie })).status, 200);
      assert.equal((await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId, quantity: 1 } })).status, 201);
      await Product.updateOne({ _id: productId }, { $set: { price: 1299 } });
      cart = (await request("/api/cart", { cookie: customerCookie })).data; assert.equal(cart.items.find((item) => item.product._id === productId).price, 1299);
    });
    await t.test("Multi-category COD checkout creates one invoice, clears cart and replays once", async () => {
      const cart = (await request("/api/cart", { cookie: customerCookie })).data;
      const totals = calculateTotals(cart.items); const before = (await Product.findById(productId)).stock;
      const body = { paymentMethod: "cod", shippingAddress: address, checkoutKey: "native-http-catalog-checkout" };
      const placed = await request("/api/orders", { method: "POST", cookie: customerCookie, body }); assert.equal(placed.status, 201); assert.equal(placed.data.totalAmount, totals.totalAmount); orderId = placed.data._id;
      assert.equal(placed.data.items.length, 23); assert.equal((await Product.findById(productId)).stock, before - 1);
      const replay = await request("/api/orders", { method: "POST", cookie: customerCookie, body }); assert.equal(replay.status, 200); assert.equal(replay.data._id, orderId);
      assert.equal((await request("/api/cart", { cookie: customerCookie })).data.items.length, 0);
      const invoice = await request("/api/invoices/order/" + orderId, { cookie: customerCookie }); assert.equal(invoice.status, 200); assert.equal(invoice.data.totalAmount, totals.totalAmount); invoiceId = invoice.data._id;
      assert.equal((await request("/api/orders/" + orderId, { cookie: otherCookie })).status, 403);
      assert.equal((await request("/api/invoices/" + invoiceId, { cookie: otherCookie })).status, 403);
    });
    await t.test("Cancellation restores all purchased stock once and synchronizes the invoice", async () => {
      const before = (await Product.findById(productId)).stock;
      const options = { method: "PUT", cookie: adminCookie, body: { status: "cancelled", cancelReason: "Native acceptance test" } };
      assert.equal((await request("/api/orders/" + orderId + "/status", options)).status, 200);
      assert.equal((await request("/api/orders/" + orderId + "/status", options)).status, 200);
      assert.equal((await Product.findById(productId)).stock, before + 1);
      assert.equal((await Invoice.findById(invoiceId)).paymentStatus, "cancelled");
    });
    await t.test("Archived items remain removable and block checkout without touching stock", async () => {
      await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId, quantity: 1 } });
      await request("/api/products/" + productId, { method: "DELETE", cookie: adminCookie });
      const cart = (await request("/api/cart", { cookie: customerCookie })).data; assert.equal(cart.items[0].unavailable, true);
      const blocked = await request("/api/orders", { method: "POST", cookie: customerCookie, body: { paymentMethod: "cod", shippingAddress: address, checkoutKey: "native-archived-checkout" } }); assert.equal(blocked.status, 409);
      assert.equal((await request("/api/cart/" + cart.items[0]._id, { method: "DELETE", cookie: customerCookie })).status, 200);
      await request("/api/products/" + productId, { method: "PUT", cookie: adminCookie, body: { isArchived: false } });
    });
    await t.test("Two simultaneous customers cannot buy the same final unit", async () => {
      const product = await Product.create({ name: "Last unit", slug: "last-unit", category: (await Category.findOne())._id, price: 100, stock: 1 });
      for (const cookie of [customerCookie, otherCookie]) await request("/api/cart", { method: "POST", cookie, body: { productId: product._id.toString(), quantity: 1 } });
      const results = await Promise.all([customerCookie, otherCookie].map((cookie, i) => request("/api/orders", { method: "POST", cookie, body: { paymentMethod: "cod", shippingAddress: address, checkoutKey: "native-last-unit-" + i } })));
      assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
      assert.equal((await Product.findById(product._id)).stock, 0); assert.equal(await Order.countDocuments({ "items.product": product._id }), 1);
      const failedIndex = results.findIndex((result) => result.status === 409);
      assert.equal((await request("/api/cart", { cookie: [customerCookie, otherCookie][failedIndex] })).data.items.length, 1);
      for (const cookie of [customerCookie, otherCookie]) await request("/api/cart", { method: "DELETE", cookie });
    });
    await t.test("An invoice-write failure rolls back real stock/order writes and retains the cart", async () => {
      await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId, quantity: 1 } });
      const before = (await Product.findById(productId)).stock; const orderCount = await Order.countDocuments();
      const original = Invoice.create;
      try {
        Invoice.create = async () => { throw new Error("Native injected invoice failure"); };
        await assert.rejects(createOrderFromCart({ user: await User.findById(customer._id), paymentMethod: "cod", shippingAddress: address, checkoutKey: "native-failed-invoice-write" }), /Native injected invoice failure/);
      } finally { Invoice.create = original; }
      assert.equal((await Product.findById(productId)).stock, before); assert.equal(await Order.countDocuments(), orderCount);
      assert.equal((await Cart.findOne({ user: customer._id })).items.length, 1); assert.equal(await Lock.countDocuments(), 0);
    });
    await t.test("Concurrent same-cart checkout and repeat key reserve inventory only once", async () => {
      const body = { paymentMethod: "cod", shippingAddress: address, checkoutKey: "native-concurrent-cart-key" };
      const before = (await Product.findById(productId)).stock;
      const results = await Promise.all([1, 2].map(() => request("/api/orders", { method: "POST", cookie: customerCookie, body })));
      assert.equal(results.filter((result) => result.status === 201).length, 1);
      assert.ok(results.every((result) => [200, 201, 409].includes(result.status)));
      assert.equal((await request("/api/orders", { method: "POST", cookie: customerCookie, body })).status, 200);
      assert.equal(await Order.countDocuments({ checkoutKey: body.checkoutKey }), 1); assert.equal((await Product.findById(productId)).stock, before - 1);
    });
    await t.test("Multer upload upgrade accepts images, rejects unexpected files and preserves admin gates", async () => {
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZfsAAAAASUVORK5CYII=", "base64");
      const form = new FormData(); form.append("image", new Blob([png], { type: "image/png" }), "native.png");
      const uploaded = await request("/api/uploads", { method: "POST", cookie: adminCookie, body: form }); assert.equal(uploaded.status, 201); uploads.push(uploaded.data.url);
      const bad = new FormData(); bad.append("image", new Blob(["plain"], { type: "text/plain" }), "bad.txt");
      assert.equal((await request("/api/uploads", { method: "POST", cookie: adminCookie, body: bad })).status, 400);
      assert.equal((await request("/api/uploads", { method: "POST", cookie: customerCookie, body: {} })).status, 403);
      const extra = new FormData(); extra.append("image", new Blob([png], { type: "image/png" }), "a.png"); extra.append("image", new Blob([png], { type: "image/png" }), "b.png");
      assert.equal((await request("/api/uploads", { method: "POST", cookie: adminCookie, body: extra })).status, 400);
    });
  } finally {
    for (const upload of uploads) await fs.unlink(path.join(__dirname, "../uploads", path.basename(upload))).catch(() => {});
    listener.close(); listener.closeAllConnections();
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

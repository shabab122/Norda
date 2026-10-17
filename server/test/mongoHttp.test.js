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
  const Payment = require("../models/Payment");
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
    const response = await fetch(base + url, { method: options.method || "GET", redirect: "manual", headers, body: options.body === undefined ? undefined : isForm ? options.body : JSON.stringify(options.body) });
    const data = (response.headers.get("content-type") || "").includes("json") ? await response.json() : await response.text();
    return { status: response.status, data, location: response.headers.get("location"), cookie: (response.headers.get("set-cookie") || "").split(";")[0] };
  };
  const address = { line1: "Native Test Road", city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678" };
  let customer; let otherCustomer; let adminCookie; let customerCookie; let otherCookie; let productId; let orderId; let invoiceId; let acceptanceProductId;
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
      const other = await request("/api/auth/register", { method: "POST", body: { name: "Another customer", email: "other@norda-test.example", password: "OtherCustomer123" } }); assert.equal(other.status, 201); otherCookie = other.cookie; otherCustomer = other.data;
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
    await t.test("Admin inventory edits, customer COD delivery, paid invoice and verified review complete the full journey", async () => {
      const product = await request("/api/products", { method: "POST", cookie: adminCookie, body: { name: "Acceptance journal", category: (await Category.findOne())._id.toString(), brandRef: (await Brand.findOne())._id.toString(), price: 900, stock: 4, images: ["/assets/products/photos/notebook.webp"] } });
      assert.equal(product.status, 201); acceptanceProductId = product.data._id;
      assert.equal((await request("/api/products/" + acceptanceProductId, { method: "PUT", cookie: adminCookie, body: { stock: 12, expectedStock: 4 } })).status, 200);
      assert.equal((await request("/api/products/" + acceptanceProductId, { method: "PUT", cookie: adminCookie, body: { stock: 99, expectedStock: 4 } })).status, 409);
      assert.equal((await Product.findById(acceptanceProductId)).stock, 12);
      await request("/api/cart", { method: "DELETE", cookie: customerCookie });
      assert.equal((await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId: acceptanceProductId, quantity: 2 } })).status, 201);
      const placed = await request("/api/orders", { method: "POST", cookie: customerCookie, body: { paymentMethod: "cod", shippingAddress: address, checkoutKey: "acceptance-delivered-cod" } }); assert.equal(placed.status, 201);
      assert.equal((await Product.findById(acceptanceProductId)).stock, 10);
      assert.equal((await request("/api/orders/" + placed.data._id + "/status", { method: "PUT", cookie: adminCookie, body: { status: "delivered" } })).status, 409);
      for (const status of ["processing", "shipped", "delivered"]) assert.equal((await request("/api/orders/" + placed.data._id + "/status", { method: "PUT", cookie: adminCookie, body: { status } })).status, 200);
      const delivered = await Order.findById(placed.data._id); assert.equal(delivered.isPaid, true); assert.equal(delivered.status, "delivered");
      const invoice = await request("/api/invoices/order/" + delivered._id, { cookie: customerCookie }); assert.equal(invoice.data.paymentStatus, "paid"); assert.equal(invoice.data.totalAmount, delivered.totalAmount);
      assert.equal((await request("/api/auth/profile", { cookie: customerCookie })).data.address.line1, address.line1);
      const review = await request("/api/reviews", { method: "POST", cookie: customerCookie, body: { productId: acceptanceProductId, rating: 5, comment: "Native complete customer journey" } }); assert.equal(review.status, 201); assert.equal(review.data.verifiedPurchase, true);
      assert.equal((await Product.findById(acceptanceProductId)).stock, 10);
      assert.equal((await request("/api/orders/" + delivered._id + "/status", { method: "PUT", cookie: adminCookie, body: { status: "cancelled" } })).status, 409);
    });
    await t.test("Two customers receive different profiles and only their own orders, invoices and carts", async () => {
      assert.equal((await request("/dashboard.html")).status, 200);
      for (const [cookie, account] of [[customerCookie, customer], [otherCookie, otherCustomer]]) {
        const profile = await request("/api/auth/profile", { cookie }); assert.equal(profile.data.email, account.email);
        const orders = await request("/api/orders/my", { cookie }); assert.equal(orders.status, 200); assert.ok(orders.data.every((order) => order.user === account._id));
        const invoices = await request("/api/invoices/my", { cookie }); assert.equal(invoices.status, 200); assert.ok(invoices.data.every((invoice) => invoice.user === account._id));
        assert.equal((await request("/api/admin/dashboard-summary", { cookie })).status, 403);
      }
      await request("/api/cart", { method: "DELETE", cookie: customerCookie }); await request("/api/cart", { method: "DELETE", cookie: otherCookie });
      await request("/api/cart", { method: "POST", cookie: otherCookie, body: { productId: acceptanceProductId, quantity: 1 } });
      assert.equal((await request("/api/cart", { cookie: customerCookie })).data.items.length, 0); assert.equal((await request("/api/cart", { cookie: otherCookie })).data.items.length, 1);
      await request("/api/cart", { method: "DELETE", cookie: otherCookie });
      const summary = await request("/api/admin/dashboard-summary", { cookie: adminCookie }); assert.equal(summary.status, 200); assert.equal(summary.data.totalOrders, await Order.countDocuments());
      const csv = await request("/api/admin/reports/orders.csv", { cookie: adminCookie }); assert.equal(csv.status, 200); assert.match(csv.data, /Acceptance journal|Order ID/);
    });
    await t.test("Controlled gateway success, fail, cancel, repeated IPN and late validation preserve real MongoDB records", async () => {
      const gateway = require("../services/sslcommerzService");
      const original = { isConfigured: gateway.isConfigured, createPaymentSession: gateway.createPaymentSession, validatePayment: gateway.validatePayment };
      const clientUrl = process.env.CLIENT_APP_URL; process.env.CLIENT_APP_URL = "https://norda-test.example";
      try {
        gateway.isConfigured = () => true;
        let sessions = 0;
        gateway.createPaymentSession = async () => { sessions++; return { checkoutUrl: "https://sandbox.sslcommerz.com/EasyCheckOut/acceptance-test", sessionKey: "native-test-session" }; };
        for (const outcome of ["success", "fail", "cancel", "mismatch"]) {
          const beforeStock = (await Product.findById(acceptanceProductId)).stock;
          await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId: acceptanceProductId, quantity: 1 } });
          const body = { shippingAddress: address, checkoutKey: "native-payment-acceptance-" + outcome };
          const started = await request("/api/payments/sslcommerz/initiate", { method: "POST", cookie: customerCookie, body }); assert.equal(started.status, 201); const paymentOrderId = started.data.orderId;
          const replay = await request("/api/payments/sslcommerz/initiate", { method: "POST", cookie: customerCookie, body }); assert.equal(replay.data.orderId, paymentOrderId); assert.equal(await Payment.countDocuments({ order: paymentOrderId }), 1);
          const payment = await Payment.findOne({ order: paymentOrderId });
          gateway.validatePayment = async () => ({ status: "VALID", tran_id: payment.transactionId, amount: payment.amount + (outcome === "mismatch" ? 1 : 0), currency: "BDT", risk_level: 0, val_id: "native-validation" });
          const callback = { method: "POST", body: { tran_id: payment.transactionId, val_id: "native-validation" } };
          if (outcome === "success") {
            for (let repeat = 0; repeat < 2; repeat++) {
              const accepted = await request("/api/payments/sslcommerz/success", callback); assert.equal(accepted.status, 303); assert.match(accepted.location, /status=success/);
              assert.equal((await request("/api/payments/sslcommerz/ipn", { method: "POST", body: { ...callback.body, status: "VALID" } })).status, 200);
            }
            await request("/api/payments/sslcommerz/fail", callback); await request("/api/payments/sslcommerz/cancel", callback);
            const paid = await Order.findById(paymentOrderId); assert.equal(paid.paymentStatus, "paid"); assert.equal(paid.status, "processing"); assert.equal((await Invoice.findOne({ order: paymentOrderId })).paymentStatus, "paid");
            assert.equal((await Product.findById(acceptanceProductId)).stock, beforeStock - 1);
          } else {
            if (outcome === "mismatch") assert.equal((await request("/api/payments/sslcommerz/ipn", { method: "POST", body: { ...callback.body, status: "VALID" } })).status, 422);
            else {
              assert.equal((await request("/api/payments/sslcommerz/" + outcome, callback)).status, 303);
              assert.equal((await request("/api/payments/sslcommerz/ipn", { method: "POST", body: { ...callback.body, status: outcome === "cancel" ? "CANCELLED" : "FAILED" } })).status, 200);
              assert.equal((await Order.findById(paymentOrderId)).paymentStatus, outcome === "cancel" ? "cancelled" : "failed");
              assert.equal((await Invoice.findOne({ order: paymentOrderId })).paymentStatus, outcome === "cancel" ? "cancelled" : "failed");
            }
            assert.equal((await Order.findById(paymentOrderId)).isPaid, false);
            assert.equal((await request("/api/orders/" + paymentOrderId + "/status", { method: "PUT", cookie: adminCookie, body: { status: "processing" } })).status, 409);
            for (let repeat = 0; repeat < 2; repeat++) assert.equal((await request("/api/orders/" + paymentOrderId + "/status", { method: "PUT", cookie: adminCookie, body: { status: "cancelled", cancelReason: "Native sandbox fixture" } })).status, 200);
            assert.equal((await Product.findById(acceptanceProductId)).stock, beforeStock);
            if (outcome === "cancel") {
              for (let repeat = 0; repeat < 2; repeat++) assert.equal((await request("/api/payments/sslcommerz/ipn", { method: "POST", body: { ...callback.body, status: "VALID" } })).status, 200);
              const late = await Order.findById(paymentOrderId); assert.equal(late.status, "cancelled"); assert.equal(late.paymentStatus, "review"); assert.equal((await Product.findById(acceptanceProductId)).stock, beforeStock);
            }
          }
        }
        assert.equal(sessions, 4);
      } finally { Object.assign(gateway, original); if (clientUrl === undefined) delete process.env.CLIENT_APP_URL; else process.env.CLIENT_APP_URL = clientUrl; }
    });
    await require("../test-support/demoJourneys").demoJourneys(t, {
      request, models: { Order, Payment, Product, Invoice, OperationLock: Lock }, customerCookie, otherCookie, adminCookie, productId: acceptanceProductId, address,
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
    await t.test("Read-only acceptance preflight connects at the configured MongoDB port and preserves records", async () => {
      const { spawnSync } = require("node:child_process");
      const testUri = new URL(uri); testUri.pathname = "/" + dbName;
      const before = { products: await Product.countDocuments(), users: await User.countDocuments(), orders: await Order.countDocuments() };
      const result = spawnSync(process.execPath, [path.join(__dirname, "../scripts/acceptance-preflight.js")], { encoding: "utf8", timeout: 15000, env: { ...process.env, MONGO_URI: testUri.toString(), PORT: "5000" } });
      assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /MongoDB connection: PASS/); assert.match(result.stdout, new RegExp(testUri.port));
      assert.doesNotMatch(result.stdout, new RegExp(process.env.JWT_SECRET));
      assert.deepEqual({ products: await Product.countDocuments(), users: await User.countDocuments(), orders: await Order.countDocuments() }, before);
    });
  } finally {
    for (const upload of uploads) await fs.unlink(path.join(__dirname, "../uploads", path.basename(upload))).catch(() => {});
    listener.close(); listener.closeAllConnections();
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

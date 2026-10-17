const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
process.env.CLIENT_URL = "https://norda.example";
process.env.NODE_ENV = "test";
const { installMemoryStore } = require("../test-support/memoryStore");
const store = installMemoryStore();
const jwt = require("jsonwebtoken");
const app = require("../app");
const gateway = require("../services/sslcommerzService");
const originalGateway = { isConfigured: gateway.isConfigured, createPaymentSession: gateway.createPaymentSession, validatePayment: gateway.validatePayment };
const address = { line1: 'House "Rose", Road 4', city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678" };

test("HTTP regression journeys using an isolated, fault-injectable model adapter", async (t) => {
  const listener = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  const base = "http://127.0.0.1:" + listener.address().port;
  let customerCookie; let customerId; let adminCookie; let productId; let categoryId; let brandId; let orderId; let invoiceId;
  const request = async (url, { method = "GET", body, cookie, headers = {} } = {}) => {
    const response = await fetch(base + url, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...headers }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    const data = response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text();
    return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";")[0], location: response.headers.get("location"), headers: response.headers };
  };
  try {
    await t.test("All 19 pages and their local assets are served", async () => {
      const pages = [];
      const collect = async (dir, prefix = "") => { for (const entry of await fs.readdir(dir, { withFileTypes: true })) { if (entry.isDirectory()) await collect(path.join(dir, entry.name), prefix + entry.name + "/"); else if (entry.name.endsWith(".html")) pages.push("/" + prefix + entry.name); } };
      await collect(path.join(__dirname, "../../client"));
      assert.equal(pages.length, 19);
      for (const page of pages) { const response = await request(page); assert.equal(response.status, 200, page); assert.match(response.data, /<!DOCTYPE html>/i); }
      assert.equal((await request("/assets/products/headphones.svg")).status, 200);
      assert.equal((await request("/api/health")).status, 200);
    });
    await t.test("Registration, invalid login and cookie-backed profile work", async () => {
      const register = await request("/api/auth/register", { method: "POST", body: { name: 'Buyer "One"', email: "BUYER@example.com", password: "TestPassword123", role: "admin" } });
      assert.equal(register.status, 201); assert.equal(register.data.role, "user"); assert.equal(register.data.email, "buyer@example.com"); assert.ok(register.cookie);
      customerCookie = register.cookie; customerId = register.data._id;
      assert.equal((await request("/api/auth/login", { method: "POST", body: { email: "buyer@example.com", password: "wrong" } })).status, 401);
      const profile = await request("/api/auth/profile", { cookie: customerCookie }); assert.equal(profile.status, 200); assert.equal(profile.data._id, customerId); assert.equal(profile.data.password, undefined);
      const admin = await store.models.User.create({ name: "Admin", email: "admin@example.com", role: "admin", password: "AdminPassword123", tokenVersion: 0 });
      adminCookie = "norda_token=" + jwt.sign({ id: admin._id, version: 0 }, process.env.JWT_SECRET);
    });
    await t.test("Protected/admin APIs reject missing or customer credentials", async () => {
      assert.equal((await request("/api/cart")).status, 401);
      assert.equal((await request("/api/admin/dashboard-summary", { cookie: customerCookie })).status, 403);
      assert.equal((await request("/api/products", { method: "POST", cookie: customerCookie, body: {} })).status, 403);
      assert.equal((await request("/api/uploads", { method: "POST", cookie: customerCookie })).status, 403);
    });
    await t.test("Admin catalog management and discounted-price sorting work", async () => {
      const category = await request("/api/categories", { method: "POST", cookie: adminCookie, body: { name: "Electronics" } }); assert.equal(category.status, 201); categoryId = category.data._id;
      const brand = await request("/api/brands", { method: "POST", cookie: adminCookie, body: { name: "Norda Test Brand" } }); assert.equal(brand.status, 201); brandId = brand.data._id;
      const first = await request("/api/products", { method: "POST", cookie: adminCookie, body: { name: 'Headphones "Everyday"', price: 2000, discountPrice: 750, stock: 8, category: categoryId, brandRef: brandId, images: ["/assets/products/headphones.svg", "/assets/products/watch.svg"], isFeatured: true } });
      assert.equal(first.status, 201); productId = first.data._id;
      assert.equal((await request("/api/products", { method: "POST", cookie: adminCookie, body: { name: "Speaker", price: 1000, stock: 10, category: categoryId, brandRef: brandId } })).status, 201);
      const list = await request("/api/products?sort=price_asc&category=" + categoryId); assert.equal(list.status, 200); assert.equal(list.data.products[0]._id, productId); assert.equal(list.data.products[0].effectivePrice, 750);
      const page = await request("/api/products/manage?limit=1&page=2", { cookie: adminCookie }); assert.equal(page.data.products.length, 1); assert.equal(page.data.pages, 2);
      assert.equal((await request("/api/products?minPrice=99&maxPrice=10")).status, 400);
      assert.equal((await request("/api/categories/" + categoryId, { method: "DELETE", cookie: adminCookie })).status, 409);
    });
    await t.test("Cart, COD checkout and order replay preserve one invoice", async () => {
      assert.equal((await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId, quantity: 2 } })).status, 201);
      const payload = { shippingAddress: address, paymentMethod: "cod", checkoutKey: "http-cod-checkout-key" };
      const placed = await request("/api/orders", { method: "POST", cookie: customerCookie, body: payload }); assert.equal(placed.status, 201); assert.equal(placed.data.totalAmount, 1620); orderId = placed.data._id;
      const replay = await request("/api/orders", { method: "POST", cookie: customerCookie, body: payload }); assert.equal(replay.status, 200); assert.equal(replay.data._id, orderId);
      const invoice = await request("/api/invoices/order/" + orderId, { cookie: customerCookie }); assert.equal(invoice.status, 200); assert.equal(invoice.data.shippingAddress.line1, address.line1); invoiceId = invoice.data._id;
      assert.equal((await request("/api/cart", { cookie: customerCookie })).data.items.length, 0);
    });
    await t.test("Other customers cannot access an order or invoice", async () => {
      const other = await request("/api/auth/register", { method: "POST", body: { name: "Other", email: "other@example.com", password: "TestPassword456" } });
      assert.equal((await request("/api/orders/" + orderId, { cookie: other.cookie })).status, 403);
      assert.equal((await request("/api/invoices/" + invoiceId, { cookie: other.cookie })).status, 403);
    });
    await t.test("Delivery unlocks verified reviews, rating recalculation and deletion", async () => {
      assert.equal((await request("/api/reviews", { method: "POST", cookie: customerCookie, body: { productId, rating: 5 } })).status, 403);
      for (const status of ["processing", "shipped", "delivered"]) assert.equal((await request("/api/orders/" + orderId + "/status", { method: "PUT", cookie: adminCookie, body: { status } })).status, 200);
      const review = await request("/api/reviews", { method: "POST", cookie: customerCookie, body: { productId, rating: 5, comment: 'Useful "everyday" item' } }); assert.equal(review.status, 201); assert.equal(review.data.verifiedPurchase, true);
      assert.equal((await request("/api/products/" + productId)).data.ratingCount, 1);
      assert.equal((await request("/api/reviews/" + review.data._id, { method: "DELETE", cookie: customerCookie })).status, 200);
      assert.equal((await request("/api/products/" + productId)).data.ratingCount, 0);
    });
    await t.test("Admin uploads validate real file signatures and clean a rejected file", async () => {
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZfsAAAAASUVORK5CYII=", "base64");
      const form = new FormData(); form.append("image", new Blob([png], { type: "image/png" }), "one.png");
      const upload = await request("/api/uploads", { method: "POST", cookie: adminCookie, body: form }); assert.equal(upload.status, 201); assert.match(upload.data.url, /^\/uploads\//);
      const bad = new FormData(); bad.append("image", new Blob(["not an image"], { type: "image/jpeg" }), "renamed.jpg");
      assert.equal((await request("/api/uploads", { method: "POST", cookie: adminCookie, body: bad })).status, 400);
    });
    await t.test("Gateway session replay and cross-origin callback/IPN remain usable", async () => {
      gateway.isConfigured = () => true;
      let initiated = 0;
      gateway.createPaymentSession = async () => { initiated++; return { checkoutUrl: "https://sandbox.sslcommerz.com/audit-session", sessionKey: "audit-key" }; };
      await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId, quantity: 1 } });
      const body = { shippingAddress: address, checkoutKey: "http-online-checkout-key" };
      const first = await request("/api/payments/sslcommerz/initiate", { method: "POST", cookie: customerCookie, body }); assert.equal(first.status, 201);
      const replay = await request("/api/payments/sslcommerz/initiate", { method: "POST", cookie: customerCookie, body }); assert.equal(replay.data.checkoutUrl, first.data.checkoutUrl); assert.equal(initiated, 1);
      const payment = [...store.records.Payment.values()].find((row) => row.order === first.data.orderId);
      gateway.validatePayment = async () => ({ status: "VALID", tran_id: payment.transactionId, amount: payment.amount, currency: "BDT", risk_level: 0, val_id: "AUDIT-VALIDATION" });
      const callback = await fetch(base + "/api/payments/sslcommerz/success", { method: "POST", redirect: "manual", headers: { Origin: "https://sandbox.sslcommerz.com", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ tran_id: payment.transactionId, val_id: "AUDIT-VALIDATION" }) });
      assert.equal(callback.status, 303); assert.match(callback.headers.get("location"), /status=success/);
      assert.equal((await request("/api/orders/" + first.data.orderId, { cookie: customerCookie })).data.paymentStatus, "paid");
      const ipn = await request("/api/payments/sslcommerz/ipn", { method: "POST", body: { status: "VALID", tran_id: payment.transactionId, val_id: "AUDIT-VALIDATION" } }); assert.equal(ipn.status, 200);
    });
    await t.test("Gateway initialization failure keeps a visible unpaid order with a matching invoice", async () => {
      gateway.createPaymentSession = async () => { throw new Error("Injected gateway outage"); };
      await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId, quantity: 1 } });
      const result = await request("/api/payments/sslcommerz/initiate", { method: "POST", cookie: customerCookie, body: { shippingAddress: address, checkoutKey: "gateway-outage-checkout-key" } });
      assert.equal(result.status, 502); assert.ok(result.data.orderId);
      const order = await request("/api/orders/" + result.data.orderId, { cookie: customerCookie }); assert.equal(order.data.paymentStatus, "failed");
      const invoice = await request("/api/invoices/order/" + result.data.orderId, { cookie: customerCookie }); assert.equal(invoice.data.paymentStatus, "failed");
      const stockBefore = store.get("Product", productId).stock;
      const cancel = await request("/api/orders/" + result.data.orderId + "/status", { method: "PUT", cookie: adminCookie, body: { status: "cancelled", cancelReason: "Payment unavailable" } });
      assert.equal(cancel.status, 200); assert.equal(store.get("Product", productId).stock, stockBefore + 1);
    });
    await t.test("Archiving preserves detail history, blocks purchase and can be restored", async () => {
      assert.equal((await request("/api/products/" + productId, { method: "DELETE", cookie: adminCookie })).status, 200);
      assert.equal((await request("/api/products?keyword=Headphones")).data.total, 0);
      const detail = await request("/api/products/" + productId); assert.equal(detail.status, 200); assert.equal(detail.data.stock, 0); assert.equal(detail.data.images.length, 2);
      assert.equal((await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId, quantity: 1 } })).status, 404);
      assert.equal((await request("/api/products/" + productId, { method: "PUT", cookie: adminCookie, body: { isArchived: false } })).status, 200);
    });
    await t.test("Dashboard/CSV work and report date errors are rejected", async () => {
      const dashboard = await request("/api/admin/dashboard-summary", { cookie: adminCookie }); assert.equal(dashboard.status, 200); assert.equal(dashboard.data.totalOrders, 3);
      const csv = await request("/api/admin/reports/orders.csv", { cookie: adminCookie }); assert.equal(csv.status, 200); assert.match(csv.data, /Order ID/);
      assert.equal((await request("/api/admin/reports/orders.csv?from=broken", { cookie: adminCookie })).status, 400);
    });
    await t.test("Password change checks the old password and invalidates old JWTs; logout revokes the new session", async () => {
      const old = customerCookie;
      assert.equal((await request("/api/auth/profile", { method: "PUT", cookie: old, body: { currentPassword: "wrong", password: "NewPassword123" } })).status, 400);
      const changed = await request("/api/auth/profile", { method: "PUT", cookie: old, body: { currentPassword: "TestPassword123", password: "NewPassword123" } }); assert.equal(changed.status, 200); customerCookie = changed.cookie;
      assert.equal((await request("/api/auth/profile", { cookie: old })).status, 401);
      assert.equal((await request("/api/auth/profile", { cookie: customerCookie })).status, 200);
      assert.equal((await request("/api/auth/logout", { method: "POST", cookie: customerCookie })).status, 200);
      assert.equal((await request("/api/auth/profile", { cookie: customerCookie })).status, 401);
    });
  } finally {
    for (const upload of store.records.Upload.values()) await fs.unlink(path.join(__dirname, "../uploads", path.basename(upload.url))).catch(() => {});
    Object.assign(gateway, originalGateway); store.restore(); listener.close(); listener.closeAllConnections();
  }
});

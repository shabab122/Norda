const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const gateway = require("../services/sslcommerzService");
const { expireReservations, expireReservationForOrder } = require("../services/reservationService");
const { supportsTransactions } = require("../services/databaseUnit");
module.exports = async (t, { request, models }) => {
  const originals = { isConfigured: gateway.isConfigured, queryPayment: gateway.queryPayment, createPaymentSession: gateway.createPaymentSession, validatePayment: gateway.validatePayment };
  let sessions = 0;
  const remote = new Map(); const validations = new Map();
  const address = { line1: "Checkout recovery road", city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678" };
  const cookieFor = (user) => "norda_token=" + jwt.sign({ id: user._id, version: user.tokenVersion || 0 }, process.env.JWT_SECRET);
  const fixture = async () => {
    const key = crypto.randomUUID();
    const user = await models.User.create({ name: "Recovery buyer", email: key + "@example.com", password: "RecoveryPassword123", role: "user", tokenVersion: 0 });
    const category = await models.Category.create({ name: "Recovery " + key, slug: key });
    const product = await models.Product.create({ name: "Recovery headphones", slug: key, category: category._id, price: 2000, discountPrice: 1000, stock: 10, images: [] });
    const cookie = cookieFor(user);
    await request("/api/cart", { method: "POST", cookie, body: { productId: product._id, quantity: 2 } });
    const initial = await request("/api/payments/sslcommerz/initiate", { method: "POST", cookie, body: { checkoutKey: key, shippingAddress: address } });
    assert.equal(initial.status, 201);
    const order = await models.Order.findById(initial.data.orderId);
    return { user, cookie, product, order, invoice: await models.Invoice.findOne({ order: order._id }) };
  };
  const stock = async (f) => (await models.Product.findById(f.product._id)).stock;
  const due = (f) => models.Order.updateOne({ _id: f.order._id }, { $set: { reservationExpiresAt: new Date(Date.now() - 1000) } });
  const attempt = (f, key = crypto.randomUUID(), cookie = f.cookie) => request("/api/payments/sslcommerz/" + f.order._id + "/retry", { method: "POST", cookie, body: { retryKey: key } });
  gateway.isConfigured = () => true;
  gateway.createPaymentSession = async ({ transactionId }) => { sessions++; remote.set(transactionId, "PENDING"); return { sessionKey: transactionId + ":session", checkoutUrl: "https://sandbox.sslcommerz.com/recovery/" + transactionId }; };
  gateway.queryPayment = async ({ transactionId, sessionKey }) => {
    const id = transactionId || sessionKey.replace(/:session$/, "");
    const status = remote.get(id) || "FAILED";
    const row = { tran_id: id, status, ...(status === "VALIDATED" ? { val_id: id + ":validation" } : {}) };
    return sessionKey ? { APIConnect: "DONE", ...row } : { APIConnect: "DONE", no_of_trans_found: 1, element: [row] };
  };
  gateway.validatePayment = async (id) => validations.get(id);
  const valid = async (id) => {
    const p = await models.Payment.findOne({ transactionId: id }); const val = id + ":validation";
    validations.set(val, { tran_id: id, val_id: val, bank_tran_id: "bank:" + id, status: "VALID", amount: p.amount, currency: p.currency, risk_level: 0 });
    return val;
  };
  try {
    await t.test("Database topology matches the requested transaction mode", async () => {
      if (process.env.NORDA_EXPECT_TRANSACTIONS !== undefined) assert.equal(await supportsTransactions(), process.env.NORDA_EXPECT_TRANSACTIONS === "1");
    });
    await t.test("Owner-only retry rejects guests, another customer, malformed IDs and keys", async () => {
      const f = await fixture();
      assert.equal((await attempt(f, crypto.randomUUID(), "")).status, 401);
      const other = await models.User.create({ name: "Other buyer", email: crypto.randomUUID() + "@example.com", password: "OtherPassword123", tokenVersion: 0 });
      assert.equal((await attempt(f, crypto.randomUUID(), cookieFor(other))).status, 403);
      assert.equal((await attempt(f, "bad")).status, 400);
      assert.equal((await request("/api/payments/sslcommerz/bad/retry", { method: "POST", cookie: f.cookie, body: { retryKey: crypto.randomUUID() } })).status, 400);
      assert.equal(await stock(f), 8);
    });
    await t.test("Read-only order APIs show the deadline and expose no payment sessions", async () => {
      const f = await fixture(); const before = await models.Order.findById(f.order._id);
      const result = await request("/api/orders/" + f.order._id, { cookie: f.cookie });
      assert.equal(result.status, 200); assert.equal(result.data.paymentRecovery.canRetry, true); assert.ok(result.data.paymentRecovery.reservationExpiresAt);
      assert.equal(result.data.checkoutUrl, undefined); assert.equal(result.data.sessionKey, undefined);
      assert.equal((await models.Order.findById(f.order._id)).updatedAt?.toString(), before.updatedAt?.toString());
    });
    await t.test("Automatic expiry is idempotent and repeated workers restore stock only once", async () => {
      const f = await fixture(); await due(f); await expireReservations();
      await Promise.allSettled([expireReservationForOrder(f.order._id), expireReservationForOrder(f.order._id)]);
      const order = await models.Order.findById(f.order._id); assert.equal(order.status, "cancelled"); assert.ok(order.reservationExpiredAt); assert.equal(await stock(f), 10);
      assert.equal((await models.Invoice.findById(f.invoice._id)).paymentStatus, "cancelled");
    });
    await t.test("Expired order retry reserves current stock and preserves order, invoice, address, total and newer cart", async () => {
      const f = await fixture(); await due(f); await expireReservationForOrder(f.order._id); remote.set(f.order.transactionId, "EXPIRED");
      await request("/api/cart", { method: "POST", cookie: f.cookie, body: { productId: f.product._id, quantity: 1 } });
      await models.Product.updateOne({ _id: f.product._id }, { $set: { price: 9000, discountPrice: 0 } });
      const key = crypto.randomUUID(), count = sessions;
      const result = await attempt(f, key); assert.equal(result.status, 200); assert.equal(result.data.orderId.toString(), f.order._id.toString()); assert.equal(result.data.invoiceNumber, f.invoice.invoiceNumber);
      const replay = await attempt(f, key); assert.equal(replay.data.checkoutUrl, result.data.checkoutUrl); assert.equal(sessions, count + 1); assert.equal(await stock(f), 8);
      const order = await models.Order.findById(f.order._id); assert.equal(order.totalAmount, f.order.totalAmount); assert.equal(order.shippingAddress.line1, address.line1); assert.equal(order.stockRestored, false); assert.equal(order.reservationExpiredAt, null);
      const cart = await request("/api/cart", { cookie: f.cookie }); assert.equal(cart.data.items[0].quantity, 1);
      assert.equal(await models.Order.countDocuments({ user: f.user._id }), 1); assert.equal(await models.Invoice.countDocuments({ order: f.order._id }), 1);
    });
    await t.test("Pending hosted checkout resumes; terminal failure opens a fresh transaction", async () => {
      const f = await fixture(); const count = sessions; const resumed = await attempt(f); assert.equal(resumed.data.resumed, true); assert.equal(sessions, count);
      remote.set(f.order.transactionId, "FAILED");
      const result = await attempt(f); assert.equal(result.status, 200); assert.equal(result.data.resumed, false); assert.equal(sessions, count + 1);
      const newer = await models.Order.findById(f.order._id); assert.notEqual(newer.transactionId, f.order.transactionId);
      await request("/api/payments/sslcommerz/fail", { method: "POST", body: { tran_id: f.order.transactionId } });
      assert.equal((await models.Order.findById(f.order._id)).paymentStatus, "pending"); assert.equal((await models.Invoice.findById(f.invoice._id)).paymentStatus, "pending");
    });
    await t.test("Missed gateway success is validated during retry and prevents another charge", async () => {
      const f = await fixture(); remote.set(f.order.transactionId, "VALIDATED"); await valid(f.order.transactionId); const count = sessions;
      const result = await attempt(f); assert.equal(result.status, 200); assert.equal(result.data.alreadyPaid, true); assert.equal(sessions, count);
      assert.equal((await models.Order.findById(f.order._id)).paymentStatus, "paid"); assert.equal((await models.Invoice.findById(f.invoice._id)).paymentStatus, "paid");
    });
    await t.test("Payment after expiry is review, retains released stock and cannot be fulfilled", async () => {
      const f = await fixture(); await due(f); const val = await valid(f.order.transactionId);
      const result = await request("/api/payments/sslcommerz/ipn", { method: "POST", body: { status: "VALID", tran_id: f.order.transactionId, val_id: val } });
      assert.equal(result.status, 200); assert.equal(result.data.review, true); assert.equal(await stock(f), 10);
      const order = await models.Order.findById(f.order._id); assert.equal(order.status, "cancelled"); assert.equal(order.paymentStatus, "review");
      assert.equal((await attempt(f)).status, 409);
    });
    await t.test("Out-of-stock recovery leaves released inventory and invoice cancellation intact", async () => {
      const f = await fixture(); await due(f); await expireReservationForOrder(f.order._id); remote.set(f.order.transactionId, "EXPIRED");
      await models.Product.updateOne({ _id: f.product._id }, { $set: { stock: 0 } }); const count = sessions;
      assert.equal((await attempt(f)).status, 409); assert.equal(sessions, count); assert.equal(await stock(f), 0); assert.equal((await models.Invoice.findById(f.invoice._id)).paymentStatus, "cancelled");
    });
    await t.test("Manual cancellation remains final and cannot be recovered as an expiry", async () => {
      const f = await fixture(); const admin = await models.User.create({ name: "Recovery admin", email: crypto.randomUUID() + "@example.com", password: "AdminPassword123", role: "admin", tokenVersion: 0 });
      assert.equal((await request("/api/orders/" + f.order._id + "/status", { method: "PUT", cookie: cookieFor(admin), body: { status: "cancelled", cancelReason: "Cancelled by store" } })).status, 200);
      assert.equal((await attempt(f)).status, 409); assert.equal(await stock(f), 10);
    });
    await t.test("Retry success, duplicate IPN, invoice and admin delivery preserve the existing commerce flow", async () => {
      const f = await fixture(); remote.set(f.order.transactionId, "FAILED"); assert.equal((await attempt(f)).status, 200);
      const order = await models.Order.findById(f.order._id); const val = await valid(order.transactionId); const body = { status: "VALID", tran_id: order.transactionId, val_id: val };
      assert.equal((await request("/api/payments/sslcommerz/ipn", { method: "POST", body })).status, 200);
      assert.equal((await request("/api/payments/sslcommerz/ipn", { method: "POST", body })).status, 200);
      assert.equal((await models.Order.findById(order._id)).status, "processing"); assert.equal((await models.Invoice.findById(f.invoice._id)).paymentStatus, "paid"); assert.equal(await stock(f), 8);
      const admin = await models.User.create({ name: "Delivery admin", email: crypto.randomUUID() + "@example.com", password: "AdminPassword123", role: "admin", tokenVersion: 0 });
      for (const status of ["shipped", "delivered"]) assert.equal((await request("/api/orders/" + order._id + "/status", { method: "PUT", cookie: cookieFor(admin), body: { status } })).status, 200);
      assert.equal((await attempt(f)).data.alreadyPaid, true); assert.equal((await models.Order.findById(order._id)).status, "delivered");
    });
    await t.test("Concurrent retry requests produce one new payment attempt", async () => {
      const f = await fixture(); remote.set(f.order.transactionId, "FAILED"); const count = sessions, key = crypto.randomUUID();
      const results = await Promise.all([attempt(f, key), attempt(f, key)]); assert.ok(results.some((item) => item.status === 200)); assert.ok(results.every((item) => [200, 409].includes(item.status)));
      assert.equal(sessions, count + 1); assert.equal(await models.Payment.countDocuments({ order: f.order._id }), 2); assert.equal(await stock(f), 8);
    });
  } finally { Object.assign(gateway, originals); }
};

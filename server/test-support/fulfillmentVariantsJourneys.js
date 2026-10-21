const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
module.exports = async (t, { request, models }) => {
  const { Product, Order, Invoice, Cart, ShipmentEvent, OrderNotification } = models;
  const gateway = require("../services/sslcommerzService"), mail = require("../services/mailService");
  const notifications = require("../services/notificationService");
  const { expireReservationForOrder } = require("../services/reservationService");
  const methods = ["isConfigured", "createPaymentSession", "queryPayment", "validatePayment"], original = Object.fromEntries(methods.map((k) => [k, gateway[k]])), originalMail = mail.sendAccountMail;
  const sent = [], validations = new Map();
  gateway.isConfigured = () => true;
  gateway.createPaymentSession = async ({ transactionId }) => ({ sessionKey: "SESSION-" + transactionId, checkoutUrl: "https://sandbox.sslcommerz.com/checkout/" + transactionId });
  gateway.queryPayment = async ({ transactionId }) => ({ APIConnect: "DONE", no_of_trans_found: 1, element: [{ tran_id: transactionId, status: "FAILED" }] });
  gateway.validatePayment = async (id) => validations.get(id);
  mail.sendAccountMail = async (message) => { sent.push(message); return { delivery: "smtp" }; };
  const cookieFor = (user) => "norda_token=" + jwt.sign({ id: user._id, v: user.tokenVersion || 0 }, process.env.JWT_SECRET);
  const admin = await models.User.create({ name: "Fulfillment admin", email: crypto.randomUUID() + "@example.com", password: "AdminPassword123", role: "admin" }), adminCookie = cookieFor(admin);
  const post = (path, body, cookie = adminCookie) => request(path, { method: "POST", body, cookie });
  const put = (path, body, cookie = adminCookie) => request(path, { method: "PUT", body, cookie });
  const fixture = async ({ variant = true, stock = 4 } = {}) => {
    const key = crypto.randomBytes(6).toString("hex");
    const user = await models.User.create({ name: "Variant buyer", email: key + "@example.com", password: "BuyerPassword123" }), cookie = cookieFor(user);
    const category = await models.Category.create({ name: key, slug: key }), brand = await models.Brand.create({ name: key, slug: key, isActive: true });
    const body = { name: "Everyday shirt " + key, category: String(category._id), brandRef: String(brand._id), price: 1000, stock, images: ["/assets/products/collection.svg"], ...(variant ? { variants: [{ sku: "NOR-" + key + "-M", size: "M", color: "Forest", price: 1000, discountPrice: 0, stock, images: ["/assets/products/collection.svg"] }, { sku: "NOR-" + key + "-L", size: "L", color: "Cream", price: 1800, discountPrice: 1500, stock: 3, images: [] }] } : {}) };
    const created = await post("/api/products", body); assert.equal(created.status, 201, JSON.stringify(created.data));
    return { user, cookie, product: created.data, body, first: created.data.variants?.[0], second: created.data.variants?.[1] };
  };
  const add = (f, quantity = 1, variant = f.first) => post("/api/cart", { productId: String(f.product._id), quantity, ...(variant ? { variantId: String(variant._id) } : {}) }, f.cookie);
  const checkout = async (f, method = "cod", key = crypto.randomUUID()) => {
    const path = method === "cod" ? "/api/orders" : method === "demo" ? "/api/payments/demo/initiate" : "/api/payments/sslcommerz/initiate";
    const body = { checkoutKey: key, shippingAddress: { line1: "Delivery Road", city: "Dhaka", district: "Dhaka", postCode: "1205", phone: "01712345678" }, ...(method === "demo" ? { channel: "mobile_banking" } : {}) };
    const result = await post(path, body, f.cookie); assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
    const id = result.data.orderId || result.data._id;
    return { ...f, order: await Order.findById(id), result, key, checkoutBody: body, path };
  };
  const transition = (f, status) => put("/api/orders/" + f.order._id + "/status", { status });
  const shipment = (f, event = "shipped", extra = {}) => post("/api/orders/" + f.order._id + "/shipment", { event, courierName: "Norda Courier", trackingNumber: "TRACK-" + f.order._id, trackingUrl: "https://courier.example/track/" + f.order._id, requestKey: crypto.randomUUID(), ...extra });
  const variantRows = async (f) => (await Product.findById(f.product._id)).variants;
  const orderMail = (f, topic) => OrderNotification.find({ order: f.order._id, ...(topic ? { topic } : {}) });
  const inject = async (Model, method, action) => { const old = Model[method]; Model[method] = async () => { throw new Error("Injected fulfillment write failure"); }; try { return await action(); } finally { Model[method] = old; } };
  try {
    await t.test("Admin catalog keeps unique SKU options, effective prices and active public stock", async () => {
      const f = await fixture(); assert.equal(f.product.stock, 7); assert.equal(f.first.sku, f.body.variants[0].sku.toUpperCase());
      const detail = await request("/api/products/" + f.product._id); assert.equal(detail.data.hasVariants, true); assert.equal(detail.data.variants.length, 2); assert.equal(detail.data.price, 1000);
      const duplicate = await fixture({ variant: false }); const conflict = await put("/api/products/" + duplicate.product._id, { variants: f.body.variants }); assert.equal(conflict.status, 409);
      assert.equal((await put("/api/products/" + f.product._id, { variants: [{ ...f.first, expectedStock: f.first.stock, stock: -1 }, { ...f.second, expectedStock: f.second.stock }] })).status, 400);
      assert.equal((await put("/api/products/" + f.product._id, { variants: [{ ...f.first, expectedStock: f.first.stock, price: 1.001 }, { ...f.second, expectedStock: f.second.stock }] })).status, 400);
    });
    await t.test("Cart requires an exact option and keeps two variants as distinct lines", async () => {
      const f = await fixture(); assert.equal((await add(f, 1, null)).status, 409); assert.equal((await add(f, 1, { _id: "f".repeat(24) })).status, 409);
      assert.equal((await add(f, 2)).status, 201); assert.equal((await add(f, 1, f.second)).status, 201); assert.equal((await add(f, 3)).status, 409);
      const cart = await request("/api/cart", { cookie: f.cookie }); assert.equal(cart.data.items.length, 2); assert.equal(cart.data.items[0].stock, 4); assert.equal(cart.data.items[1].price, 1500);
    });
    await t.test("Variant checkout snapshots SKU/price/image and replays one invoice and confirmation", async () => {
      let f = await fixture(); await add(f, 2); await add(f, 1, f.second); f = await checkout(f);
      assert.equal(f.order.subtotal, 3500); assert.equal(f.order.totalAmount, 3620); assert.equal(f.order.items[0].sku, f.first.sku);
      const rows = await variantRows(f); assert.equal(rows[0].stock, 2); assert.equal(rows[1].stock, 2); assert.equal((await Product.findById(f.product._id)).stock, 4);
      const invoice = await Invoice.findOne({ order: f.order._id }); assert.equal(invoice.items[0].sku, f.first.sku); assert.equal(invoice.items[1].unitPrice, 1500);
      const replay = await post(f.path, f.checkoutBody, f.cookie); assert.equal(replay.status, 200); assert.equal(await Invoice.countDocuments({ order: f.order._id }), 1); assert.equal((await orderMail(f, "confirmation")).length, 1);
      assert.equal((await orderMail(f))[0].status, "queued");
    });
    await t.test("Variant edits detect stale inventory, retain inactive options and preserve historical snapshots", async () => {
      let f = await fixture(); await add(f); f = await checkout(f);
      assert.equal((await put("/api/products/" + f.product._id, { variants: f.product.variants.map((v) => ({ ...v, expectedStock: v.stock })) })).status, 409);
      assert.equal((await put("/api/products/" + f.product._id, { variants: [] })).status, 409);
      const current = await variantRows(f), edits = current.map((v, i) => ({ ...(v.toObject ? v.toObject() : v), expectedStock: v.stock, price: i ? v.price : 1200, isActive: i !== 0 }));
      assert.equal((await put("/api/products/" + f.product._id, { variants: edits })).status, 200);
      const publicDetail = await request("/api/products/" + f.product._id); assert.equal(publicDetail.data.variants.length, 1); assert.equal(publicDetail.data.stock, 3);
      assert.equal((await Invoice.findOne({ order: f.order._id })).items[0].unitPrice, 1000);
      assert.equal((await transition(f, "cancelled")).status, 200); assert.equal((await variantRows(f))[0].stock, 4);
    });
    await t.test("Deactivated cart options block checkout and legacy ordered products cannot be converted", async () => {
      const f = await fixture(); await add(f); const edits = f.product.variants.map((v) => ({ ...v, isActive: false, expectedStock: v.stock })); await put("/api/products/" + f.product._id, { variants: edits });
      const cart = await request("/api/cart", { cookie: f.cookie }); assert.equal(cart.data.items[0].unavailable, true);
      const blocked = await post("/api/orders", { shippingAddress: { line1: "Road", city: "Dhaka", district: "Dhaka", postCode: "1205", phone: "01712345678" } }, f.cookie); assert.equal(blocked.status, 409); assert.equal(await Order.countDocuments({ user: f.user._id }), 0);
      let legacy = await fixture({ variant: false }); await add(legacy); legacy = await checkout(legacy); assert.equal((await put("/api/products/" + legacy.product._id, { variants: f.body.variants })).status, 409);
    });
    await t.test("Two customers racing the final SKU cannot consume another option's stock", async () => {
      let a = await fixture({ stock: 1 }); await add(a); const bUser = await models.User.create({ name: "Second buyer", email: crypto.randomUUID() + "@example.com", password: "OtherPassword123" }); const b = { ...a, user: bUser, cookie: cookieFor(bUser) }; await add(b);
      const attempts = await Promise.allSettled([checkout(a), checkout(b)]); assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
      const rows = await variantRows(a); assert.equal(rows[0].stock, 0); assert.equal(rows[1].stock, 3);
    });
    await t.test("Tracking, shipment writes and email queues enforce customer/admin ownership", async () => {
      let f = await fixture(); await add(f); f = await checkout(f); const other = await fixture();
      assert.equal((await request("/api/orders/" + f.order._id + "/tracking")).status, 401); assert.equal((await request("/api/orders/" + f.order._id + "/tracking", { cookie: other.cookie })).status, 403);
      assert.equal((await post("/api/orders/" + f.order._id + "/shipment", { event: "shipped", requestKey: crypto.randomUUID() }, f.cookie)).status, 403);
      assert.equal((await request("/api/admin/notifications", { cookie: f.cookie })).status, 403); assert.equal((await request("/api/admin/notifications")).status, 401);
    });
    await t.test("Courier details, dispatch, progress and replay share normal fulfillment checks", async () => {
      let f = await fixture(); await add(f); f = await checkout(f); await transition(f, "processing");
      assert.equal((await shipment(f, "details_updated")).status, 200); assert.equal((await Order.findById(f.order._id)).status, "processing");
      const key = crypto.randomUUID(); assert.equal((await shipment(f, "shipped", { requestKey: key, note: "Parcel accepted" })).status, 200); assert.equal((await shipment(f, "shipped", { requestKey: key, note: "Parcel accepted" })).status, 200);
      assert.equal((await shipment(f, "shipped", { requestKey: key, note: "Different message" })).status, 409);
      assert.equal((await orderMail(f, "shipping")).length, 1); assert.equal(await ShipmentEvent.countDocuments({ order: f.order._id, event: "shipped" }), 1);
      for (const event of ["in_transit", "out_for_delivery", "delivery_attempted", "out_for_delivery", "delivered"]) assert.equal((await shipment(f, event)).status, 200);
      assert.equal((await Order.findById(f.order._id)).paymentStatus, "paid"); assert.equal((await Invoice.findOne({ order: f.order._id })).paymentStatus, "paid"); assert.equal((await orderMail(f, "delivery")).length, 1);
      const tracking = await request("/api/orders/" + f.order._id + "/tracking?limit=2", { cookie: f.cookie }); assert.equal(tracking.data.events.length, 2); assert.ok(tracking.data.pages > 1); assert.equal(tracking.data.events[0].actor, undefined); assert.equal(tracking.data.events[0].requestKey, undefined);
    });
    await t.test("Unsafe links and backwards events cannot alter shipment history", async () => {
      let f = await fixture(); await add(f); f = await checkout(f); await transition(f, "processing");
      assert.equal((await shipment(f, "shipped", { trackingUrl: "javascript:alert(1)" })).status, 400);
      assert.equal((await put("/api/orders/" + f.order._id + "/status", { shipment: { event: "shipped", requestKey: crypto.randomUUID(), trackingUrl: "javascript:alert(1)" } })).status, 400);
      assert.equal(await ShipmentEvent.countDocuments({ order: f.order._id }), 0); await shipment(f); await shipment(f, "in_transit");
      assert.equal((await shipment(f, "shipped")).status, 409); assert.equal(await ShipmentEvent.countDocuments({ order: f.order._id }), 2);
    });
    await t.test("Unpaid online orders cannot be dispatched and callback replays queue one payment email", async () => {
      let f = await fixture(); await add(f); f = await checkout(f, "sslcommerz"); assert.equal((await shipment(f)).status, 409);
      const p = await models.Payment.findOne({ order: f.order._id }), id = "VAL-" + p.transactionId; validations.set(id, { status: "VALID", tran_id: p.transactionId, val_id: id, bank_tran_id: "BANK-" + p.transactionId, amount: p.amount, currency: "BDT", risk_level: 0 });
      for (let i = 0; i < 2; i++) assert.equal((await post("/api/payments/sslcommerz/ipn", { status: "VALID", tran_id: p.transactionId, val_id: id }, "")).status, 200);
      assert.equal((await orderMail(f, "payment")).length, 1); assert.equal((await shipment(f)).status, 200);
    });
    await t.test("Expiry and real payment retry restore/reserve the same SKU on the same invoice", async () => {
      let f = await fixture(); await add(f, 2); f = await checkout(f, "sslcommerz"); const invoice = await Invoice.findOne({ order: f.order._id });
      await Order.updateOne({ _id: f.order._id }, { $set: { reservationExpiresAt: new Date(Date.now() - 1000) } }); await expireReservationForOrder(f.order._id); assert.equal((await variantRows(f))[0].stock, 4);
      const retry = await post("/api/payments/sslcommerz/" + f.order._id + "/retry", { retryKey: crypto.randomUUID() }, f.cookie); assert.equal(retry.status, 200, JSON.stringify(retry.data)); assert.equal((await variantRows(f))[0].stock, 2); assert.equal((await Invoice.findOne({ order: f.order._id })).invoiceNumber, invoice.invoiceNumber);
    });
    await t.test("Whole-order return restocks the purchased SKU only after physical receipt", async () => {
      let f = await fixture(); await add(f, 2); f = await checkout(f); for (const state of ["processing", "shipped", "delivered"]) await transition(f, state);
      const r = await post("/api/orders/" + f.order._id + "/requests", { type: "return", reason: "The size did not fit", requestKey: crypto.randomUUID() }, f.cookie); assert.equal(r.status, 201);
      const path = "/api/admin/operations/requests/" + r.data._id; assert.equal((await post(path + "/decision", { decision: "approve", note: "Please return all items" })).status, 200); assert.equal((await variantRows(f))[0].stock, 2);
      for (let i = 0; i < 2; i++) assert.equal((await post(path + "/receive", { received: true, restock: true, note: "All items received in good condition" })).status, 200);
      const rows = await variantRows(f); assert.equal(rows[0].stock, 4); assert.equal(rows[1].stock, 3); assert.equal(await models.Refund.countDocuments({ order: f.order._id }), 1);
    });
    await t.test("A queue write failure rolls back checkout, stock, cart and invoice", async () => {
      const f = await fixture(); await add(f, 2);
      await inject(OrderNotification, "create", async () => { await assert.rejects(checkout(f)); });
      assert.equal((await variantRows(f))[0].stock, 4); assert.equal(await Order.countDocuments({ user: f.user._id }), 0); assert.equal(await Invoice.countDocuments({ user: f.user._id }), 0); assert.equal((await Cart.findOne({ user: f.user._id })).items[0].quantity, 2);
    });
    await t.test("Invoice failure rolls back dispatch, shipment history and queued emails", async () => {
      let f = await fixture(); await add(f); f = await checkout(f); await transition(f, "processing");
      await inject(Invoice, "findOneAndUpdate", async () => { assert.ok((await shipment(f)).status >= 500); });
      assert.equal((await Order.findById(f.order._id)).status, "processing"); assert.equal(await ShipmentEvent.countDocuments({ order: f.order._id }), 0); assert.equal((await orderMail(f, "shipping")).length, 0);
    });
    await t.test("Committed email delivery claims once and keeps SMTP failure separate from the order", async () => {
      let f = await fixture(); await add(f); f = await checkout(f); const [row] = await orderMail(f, "confirmation"), before = sent.length;
      await Promise.all([notifications.sendNotification(row._id), notifications.sendNotification(row._id)]); assert.equal(sent.length, before + 1); assert.equal((await OrderNotification.findById(row._id)).status, "sent"); assert.ok(sent.at(-1).text.includes(f.first.sku)); assert.ok(sent.at(-1).actionUrl.includes("order-support.html"));
      let g = await fixture(); await add(g); g = await checkout(g); const [email] = await orderMail(g); mail.sendAccountMail = async () => { throw new Error("SMTP secret must never leak"); };
      await notifications.sendNotification(email._id); const failed = await OrderNotification.findById(email._id); assert.equal(failed.status, "queued"); assert.equal(failed.attempts, 1); assert.ok(!failed.lastError.includes("secret")); assert.equal((await Order.findById(g.order._id)).status, "pending");
      mail.sendAccountMail = async (m) => { sent.push(m); return { delivery: "smtp" }; };
      await OrderNotification.updateOne({ _id: email._id }, { $set: { attempts: 5, status: "failed" } }); assert.equal((await post("/api/admin/notifications/" + email._id + "/retry", {}, g.cookie)).status, 403); assert.equal((await post("/api/admin/notifications/" + email._id + "/retry", {})).status, 200); await notifications.sendNotification(email._id); assert.equal((await OrderNotification.findById(email._id)).status, "sent");
    });
    await t.test("Held email activation recovers only committed matching order state", async () => {
      let f = await fixture(); await add(f); f = await checkout(f); const [row] = await orderMail(f);
      await OrderNotification.updateOne({ _id: row._id }, { $set: { status: "held" } }); await notifications.activateHeld(await OrderNotification.findById(row._id)); assert.equal((await OrderNotification.findById(row._id)).status, "queued");
      await OrderNotification.updateOne({ _id: row._id }, { $set: { status: "held", sourceState: { status: "delivered" } } }); await notifications.activateHeld(await OrderNotification.findById(row._id)); assert.equal((await OrderNotification.findById(row._id)).status, "suppressed");
      const list = await request("/api/admin/notifications?orderId=" + f.order._id, { cookie: adminCookie }); assert.equal(list.status, 200); assert.equal(list.data.items[0].text, undefined); assert.equal(list.data.items[0].sourceState, undefined);
    });
  } finally { for (const key of methods) gateway[key] = original[key]; mail.sendAccountMail = originalMail; }
};

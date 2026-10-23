const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
module.exports = async (t, { request, models }) => {
  const { User, Category, Product, Order, Invoice, Refund, ItemReturnCase, CreditNote, AuthSession, OrderNotification } = models;
  const cookie = (u) => "norda_token=" + jwt.sign({ id: String(u._id), version: u.tokenVersion || 0 }, process.env.JWT_SECRET);
  const admin = await User.create({ name: "Management admin", email: crypto.randomUUID() + "@example.com", password: "AdminPassword123", role: "admin" }), adminCookie = cookie(admin);
  const call = (path, body, auth = adminCookie, method = "POST", headers = {}) => request(path, { method, body, cookie: auth, headers });
  const get = (path, auth = adminCookie) => request(path, { cookie: auth });
  const account = async (role = "user", permissions = []) => { const u = await User.create({ name: "Management <buyer>", email: crypto.randomUUID() + "@example.com", password: "BuyerPassword123", role, permissions }); return { user: u, cookie: cookie(u) }; };
  const fixture = async ({ quantity = 3, discount = 1.01, price = 100 } = {}) => {
    const f = await account(), key = crypto.randomBytes(6).toString("hex"), category = await Category.create({ name: key, slug: key });
    f.product = await Product.create({ name: "Everyday " + key, slug: key, category: category._id, price, stock: 14, images: [], isArchived: false, variants: [{ _id: crypto.randomBytes(12).toString("hex"), sku: "M-" + key, size: "M", color: "Sage", price, stock: 6, isActive: true }, { _id: crypto.randomBytes(12).toString("hex"), sku: "L-" + key, size: "L", color: "Sage", price, stock: 6, isActive: true }, { _id: crypto.randomBytes(12).toString("hex"), sku: "XL-" + key, size: "XL", color: "Navy", price: price + 10, stock: 2, isActive: true }] });
    assert.equal((await call("/api/cart", { productId: String(f.product._id), quantity, variantId: String(f.product.variants[0]._id) }, f.cookie)).status, 201);
    let couponCode;
    if (discount > 0) { const c = await call("/api/admin/coupons", { code: "ITEM-" + key.toUpperCase(), title: "Item return allocation", type: "fixed", value: discount, minSubtotal: 0, maxDiscount: 0, startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(), isActive: true, isPublic: false, usageLimit: 0, perUserLimit: 1 }); assert.equal(c.status, 201, JSON.stringify(c.data)); couponCode = c.data.code; }
    const made = await call("/api/orders", { couponCode, shippingAddress: { line1: "A quiet road", city: "Dhaka", district: "Dhaka", postCode: "1205", phone: "01712345678" }, checkoutKey: crypto.randomUUID() }, f.cookie);
    assert.equal(made.status, 201, JSON.stringify(made.data));
    f.order = await Order.findByIdAndUpdate(made.data._id, { $set: { isPaid: true, paymentStatus: "paid", status: "delivered", paidAt: new Date(), shipment: { state: "delivered", deliveredAt: new Date() } } }, { new: true });
    await require("../services/invoiceService").syncInvoicePayment(f.order);
    return f;
  };
  const create = (f, fields = {}) => call("/api/orders/" + f.order._id + "/item-returns", { type: "return", requestKey: crypto.randomUUID(), reason: "The size was unsuitable", items: [{ lineIndex: 0, quantity: 1 }], ...fields }, f.cookie);
  const decide = (id, decision = "approve") => call("/api/admin/item-returns/" + id + "/decision", { decision, note: "Checked by the store team" });
  const receive = (id, restock = true) => call("/api/admin/item-returns/" + id + "/receive", { received: true, note: "Returned item checked physically", items: [{ lineIndex: 0, restock }] });
  const stock = async (f, index = 0) => (await Product.findById(f.product._id)).variants[index].stock;
  const inject = async (Model, method, action, at = 1) => { const original = Model[method]; let count = 0; Model[method] = function (...args) { if (++count === at) throw new Error("Injected management write failure"); return original.apply(this, args); }; try { return await action(); } finally { Model[method] = original; } };
  await t.test("All new administrative routes reject guests and customers", async () => {
    const f = await account();
    for (const path of ["/api/admin/reports/sales", "/api/admin/reports/sales.csv", "/api/admin/customers", "/api/admin/staff", "/api/admin/staff/audit", "/api/admin/item-returns"]) { assert.equal((await get(path, "")).status, 401); assert.equal((await get(path, f.cookie)).status, 403); }
    for (const path of ["/api/auth/sessions"]) assert.equal((await get(path, "")).status, 401);
  });
  await t.test("Registration cannot grant itself a staff role or operational permissions", async () => {
    const result = await call("/api/auth/register", { name: "A new customer", email: crypto.randomUUID() + "@example.com", password: "BuyerPassword123", role: "admin", permissions: ["payments"] }, "");
    assert.equal(result.status, 201); assert.equal(result.data.role, "user"); assert.deepEqual(result.data.permissions, []);
  });
  await t.test("Staff grants are explicit, immediately enforced and never change account passwords", async () => {
    const f = await account(), password = (await User.findById(f.user._id).select("+password")).password;
    const body = { email: f.user.email, role: "staff", permissions: ["inventory", "customers"], note: "Responsible for stock and customers" };
    const saved = await call("/api/admin/staff", body, adminCookie, "PUT"); assert.equal(saved.status, 200); assert.equal(saved.data.role, "staff");
    assert.equal((await get("/api/admin/inventory", f.cookie)).status, 200); assert.equal((await get("/api/admin/customers", f.cookie)).status, 200);
    for (const path of ["/api/admin/reports/sales", "/api/orders", "/api/admin/operations", "/api/admin/staff", "/api/admin/notifications", "/api/products/manage", "/api/admin/coupons", "/api/admin/store-settings"]) assert.equal((await get(path, f.cookie)).status, 403, path);
    assert.equal((await call("/api/admin/staff", { ...body, permissions: ["payments"] }, f.cookie, "PUT")).status, 403);
    assert.equal((await call("/api/admin/staff", { ...body, email: admin.email }, adminCookie, "PUT")).status, 403);
    assert.equal((await call("/api/admin/staff", { ...body, permissions: ["unknown"] }, adminCookie, "PUT")).status, 400);
    await call("/api/admin/staff", { ...body, role: "user", permissions: [] }, adminCookie, "PUT");
    assert.equal((await get("/api/admin/inventory", f.cookie)).status, 403); assert.equal((await User.findById(f.user._id).select("+password")).password, password);
    assert.equal((await get("/api/admin/staff/audit")).data.items.filter((a) => String(a.target?._id || a.target) === String(f.user._id)).length, 2);
  });
  await t.test("Staff permissions roll back when the access audit cannot be persisted", async () => {
    const f = await account(); await inject(models.StaffAudit, "create", async () => assert.equal((await call("/api/admin/staff", { email: f.user.email, role: "staff", permissions: ["payments"], note: "Grant return management" }, adminCookie, "PUT")).status, 500));
    assert.equal((await User.findById(f.user._id)).role, "user");
  });
  await t.test("Customer search is literal and history contains no hashes, sessions or other buyers' orders", async () => {
    const f = await fixture(); const found = await get("/api/admin/customers?q=" + encodeURIComponent(f.user.email)); assert.equal(found.status, 200); assert.equal(found.data.items.length, 1);
    const result = await get("/api/admin/customers/" + f.user._id + "/orders"); assert.equal(result.status, 200); assert.equal(result.data.total, 1); assert.equal(String(result.data.items[0]._id), String(f.order._id)); assert.doesNotMatch(JSON.stringify(result.data), /password|tokenVersion|Hash|shippingAddress/);
    assert.equal((await get("/api/admin/customers?q=" + encodeURIComponent(".*"))).data.total, 0);
  });
  await t.test("Each login creates a distinct session and a customer can revoke only their own devices", async () => {
    const f = await account();
    const a = await call("/api/auth/login", { email: f.user.email, password: "BuyerPassword123" }, "", "POST", { "user-agent": "Desktop browser" });
    const b = await call("/api/auth/login", { email: f.user.email, password: "BuyerPassword123" }, "", "POST", { "user-agent": "Mobile browser" });
    assert.equal(a.status, 200); assert.equal(b.status, 200); assert.ok(a.cookie && b.cookie); assert.notEqual(a.cookie, b.cookie);
    const list = await get("/api/auth/sessions", a.cookie); assert.equal(list.data.length, 2); assert.equal(list.data.filter((s) => s.current).length, 1); assert.doesNotMatch(JSON.stringify(list.data), /legacyTokenHash|tokenVersion|password/);
    const target = list.data.find((s) => !s.current); const other = await account(); assert.equal((await call("/api/auth/sessions/" + target._id, undefined, other.cookie, "DELETE")).status, 404);
    assert.equal((await call("/api/auth/sessions/" + target._id, undefined, a.cookie, "DELETE")).status, 200); assert.equal((await get("/api/auth/profile", b.cookie)).status, 401); assert.equal((await get("/api/auth/profile", a.cookie)).status, 200);
  });
  await t.test("Sign out other devices rotates this session and invalidates even unseen legacy JWTs", async () => {
    const f = await account(), hiddenLegacy = cookie(f.user);
    const login = await call("/api/auth/login", { email: f.user.email, password: "BuyerPassword123" }, "");
    const result = await call("/api/auth/sessions/revoke-others", {}, login.cookie); assert.equal(result.status, 200); assert.ok(result.cookie);
    assert.equal((await get("/api/auth/profile", hiddenLegacy)).status, 401); assert.equal((await get("/api/auth/profile", login.cookie)).status, 401); assert.equal((await get("/api/auth/profile", result.cookie)).status, 200);
    assert.equal((await get("/api/auth/sessions", result.cookie)).data.length, 1);
  });
  await t.test("Session revocation rollback retains the current login if a replacement session write fails", async () => {
    const f = await account(), login = await call("/api/auth/login", { email: f.user.email, password: "BuyerPassword123" }, "");
    await inject(AuthSession, "create", async () => assert.equal((await call("/api/auth/sessions/revoke-others", {}, login.cookie)).status, 500));
    assert.equal((await get("/api/auth/profile", login.cookie)).status, 200);
  });
  await t.test("Signing out one current session preserves another signed-in device", async () => {
    const f = await account(); const a = await call("/api/auth/login", { email: f.user.email, password: "BuyerPassword123" }, ""), b = await call("/api/auth/login", { email: f.user.email, password: "BuyerPassword123" }, "");
    assert.equal((await call("/api/auth/logout", {}, a.cookie)).status, 200); assert.equal((await get("/api/auth/profile", a.cookie)).status, 401); assert.equal((await get("/api/auth/profile", b.cookie)).status, 200);
  });
  await t.test("Email preferences suppress queued delivery and security preferences cannot be disabled", async () => {
    const f = await fixture();
    const result = await call("/api/auth/notification-preferences", { orderUpdates: false, returnUpdates: false, refundUpdates: true }, f.cookie, "PUT"); assert.equal(result.status, 200); assert.equal(result.data.securityEmails, true);
    assert.equal((await call("/api/auth/notification-preferences", { securityEmails: false }, f.cookie, "PUT")).status, 400);
    const made = await create(f); assert.equal(made.status, 201); const n = await OrderNotification.findOne({ order: f.order._id, topic: "return" }); assert.equal(n.status, "suppressed");
    const confirmation = await OrderNotification.findOne({ order: f.order._id, topic: "confirmation" });
    await require("../services/notificationService").sendNotification(confirmation._id);
    assert.equal((await OrderNotification.findById(confirmation._id)).status, "suppressed");
  });
  await t.test("Delivery outcomes are verified, idempotent and a later delivery cannot erase a bounce", async () => {
    const f = await fixture(); const n = await OrderNotification.findOne({ order: f.order._id, topic: "confirmation" });
    await OrderNotification.updateOne({ _id: n._id }, { $set: { status: "sent", transport: "smtp", messageId: "<test-" + n._id + "@example.com>", deliveryStatus: "accepted" } });
    const body = { eventId: crypto.randomUUID(), kind: "bounced", occurredAt: new Date().toISOString(), reason: "Provider confirmed address rejected", verified: true };
    assert.equal((await call("/api/admin/notifications/" + n._id + "/delivery", { ...body, verified: false })).status, 400);
    const recorded = await call("/api/admin/notifications/" + n._id + "/delivery", body); assert.equal(recorded.status, 200); assert.equal((await call("/api/admin/notifications/" + n._id + "/delivery", body)).data.replayed, true);
    assert.equal((await call("/api/admin/notifications/" + n._id + "/delivery", { ...body, kind: "delivered" })).status, 409);
    await call("/api/admin/notifications/" + n._id + "/delivery", { ...body, eventId: crypto.randomUUID(), kind: "delivered" }); assert.equal((await OrderNotification.findById(n._id)).deliveryStatus, "bounced");
    assert.equal((await get("/api/admin/notifications/" + n._id + "/events")).data.total, 2);
  });
  await t.test("Signed delivery webhooks reject stale, tampered and unsigned bodies and accept exact replays", async () => {
    process.env.MAIL_WEBHOOK_SECRET = crypto.randomBytes(32).toString("hex");
    const f = await fixture(), n = await OrderNotification.findOne({ order: f.order._id, topic: "confirmation" }); const messageId = "<signed-" + n._id + "@example.com>";
    await OrderNotification.updateOne({ _id: n._id }, { $set: { status: "sent", transport: "smtp", messageId, deliveryStatus: "accepted" } });
    const body = { provider: "test-mail", eventId: crypto.randomUUID(), messageId, kind: "complained", occurredAt: new Date().toISOString(), reason: "Complaint confirmed" };
    const timestamp = String(Math.floor(Date.now() / 1000)), sign = (time, value) => crypto.createHmac("sha256", process.env.MAIL_WEBHOOK_SECRET).update(time + "." + JSON.stringify(value)).digest("hex"), headers = { "x-norda-timestamp": timestamp, "x-norda-signature": sign(timestamp, body) };
    assert.equal((await call("/api/mail/delivery-events", body, "")).status, 401);
    assert.equal((await call("/api/mail/delivery-events", { ...body, kind: "delivered" }, "", "POST", headers)).status, 401);
    assert.equal((await call("/api/mail/delivery-events", body, "", "POST", { ...headers, "x-norda-timestamp": "1000000000" })).status, 401);
    assert.equal((await call("/api/mail/delivery-events", body, "", "POST", headers)).status, 200); assert.equal((await call("/api/mail/delivery-events", body, "", "POST", headers)).data.replayed, true);
    const made = await create(f); assert.equal(made.status, 201); const pending = await OrderNotification.findOne({ order: f.order._id, topic: "return" }); await require("../services/notificationService").sendNotification(pending._id); assert.equal((await OrderNotification.findById(pending._id)).status, "suppressed");
    delete process.env.MAIL_WEBHOOK_SECRET;
  });
  await t.test("Reports use Dhaka paid-date cohorts, exact discounts, confirmed refunds and omit simulations", async () => {
    const f = await fixture(); const paidAt = new Date("2026-01-31T18:30:00Z");
    await Order.updateOne({ _id: f.order._id }, { $set: { paidAt, status: "cancelled" } });
    await Refund.create({ order: f.order._id, user: f.user._id, gateway: "manual", scope: "order", requestKey: crypto.randomUUID(), transactionId: crypto.randomBytes(12).toString("hex"), bankTransactionId: "COD:" + f.order._id, amount: 10.01, currency: "BDT", status: "succeeded", completedAt: new Date("2026-02-01T12:00:00Z"), reason: "Report test", requestedBy: admin._id });
    const demo = await fixture(); await Order.updateOne({ _id: demo.order._id }, { $set: { paidAt, paymentMethod: "demo" } });
    const q = "?from=2026-02-01&to=2026-02-01&group=day", report = await get("/api/admin/reports/sales" + q); assert.equal(report.status, 200, JSON.stringify(report.data)); const s = report.data.summary;
    assert.equal(s.orders, 1); assert.equal(s.couponSavings, 1.01); assert.equal(s.charged, 418.99); assert.equal(s.confirmedRefunds, 10.01); assert.equal(s.netRevenue, 408.98); assert.equal(report.data.topSkus[0].units, 3); assert.equal(report.data.topProducts[0].merchandiseRevenue, 298.99); assert.equal(report.data.timeline[0].period, "2026-02-01");
    const csv = await get("/api/admin/reports/sales.csv" + q); assert.equal(csv.status, 200); assert.match(csv.data, /Net revenue/); assert.match(csv.data, /408.98/);
    assert.equal((await get("/api/admin/reports/sales?from=2026-02-30&to=2026-03-01")).status, 400); assert.equal((await get("/api/admin/reports/sales?from=2020-01-01&to=2026-03-01")).status, 400);
  });
  await t.test("Item requests enforce owner, remaining quantity, immutable idempotency and return windows", async () => {
    const f = await fixture(), other = await account();
    assert.equal((await get("/api/orders/" + f.order._id + "/item-returns", other.cookie)).status, 403);
    const body = { requestKey: crypto.randomUUID(), items: [{ lineIndex: 0, quantity: 2 }] }; const made = await create(f, body); assert.equal(made.status, 201, JSON.stringify(made.data));
    assert.equal((await create(f, body)).data._id, made.data._id); assert.equal((await create(f, { ...body, items: [{ lineIndex: 0, quantity: 1 }] })).status, 409); assert.equal((await create(f, { items: [{ lineIndex: 0, quantity: 2 }] })).status, 409);
    assert.equal((await create(f, { items: [{ lineIndex: 0, quantity: 1 }, { lineIndex: 0, quantity: 1 }] })).status, 400);
    const old = await fixture(); await Order.updateOne({ _id: old.order._id }, { $set: { shipment: { deliveredAt: new Date(Date.now() - 31 * 86400000) } } }); assert.equal((await create(old)).status, 409);
  });
  await t.test("Overlapping item requests cannot consume the same purchased quantity", async () => {
    const f = await fixture({ quantity: 1 }); const results = await Promise.all([create(f), create(f)]); assert.equal(results.filter((r) => r.status === 201).length, 1); assert.equal(await ItemReturnCase.countDocuments({ order: f.order._id }), 1);
  });
  await t.test("Partial returns allocate every coupon paisa once, including a rejection gap", async () => {
    const f = await fixture(); const a = await create(f), b = await create(f); assert.equal(a.data.creditAmount, 99.67); assert.equal(b.data.creditAmount, 99.66);
    assert.equal((await decide(a.data._id, "reject")).status, 200); const c = await create(f); const d = await create(f); assert.equal(c.data.creditAmount, 99.67); assert.equal(d.data.creditAmount, 99.66); assert.equal(Math.round((b.data.creditAmount + c.data.creditAmount + d.data.creditAmount) * 100), 29899);
    assert.equal((await create(f)).status, 409);
  });
  await t.test("Approval holds the refund and receipt issues one credit note without changing the invoice total", async () => {
    const f = await fixture(), originalStock = await stock(f); const made = await create(f); const id = made.data._id;
    const approved = await decide(id); assert.equal(approved.status, 200, JSON.stringify(approved.data)); const refundId = approved.data.refund; const refund = await Refund.findById(refundId); assert.equal(refund.status, "awaiting_return"); assert.equal(refund.amount, 99.67); assert.equal(await stock(f), originalStock);
    await require("../services/refundService").processRefund(refundId); assert.equal((await Refund.findById(refundId)).status, "awaiting_return");
    assert.equal((await call("/api/admin/operations/refunds/" + refundId + "/confirm", { confirmed: true, reference: "Too early", note: "Do not confirm before receiving" })).status, 409);
    const received = await receive(id); assert.equal(received.status, 200, JSON.stringify(received.data)); assert.equal(received.data.status, "received"); assert.equal(await stock(f), originalStock + 1); assert.equal((await Refund.findById(refundId)).status, "pending");
    assert.equal((await receive(id)).status, 200); assert.equal(await stock(f), originalStock + 1); assert.equal((await receive(id, false)).status, 409); assert.equal(await CreditNote.countDocuments({ itemCase: id }), 1);
    const inv = await Invoice.findOne({ order: f.order._id }); assert.equal(inv.totalAmount, f.order.totalAmount); assert.equal(inv.refundPendingAmount, 99.67);
    const confirmed = await call("/api/admin/operations/refunds/" + refundId + "/confirm", { confirmed: true, reference: "CASH-ITEM-001", note: "Cash actually returned to customer" }); assert.equal(confirmed.status, 200); assert.equal((await ItemReturnCase.findById(id)).status, "completed"); assert.equal((await CreditNote.findById(received.data.creditNote)).status, "settled"); assert.equal((await Invoice.findOne({ order: f.order._id })).refundedAmount, 99.67);
    const credit = await get("/api/credit-notes/" + received.data.creditNote, f.cookie); assert.equal(credit.status, 200); assert.equal(credit.data.totalAmount, 99.67); const other = await account(); assert.equal((await get("/api/credit-notes/" + received.data.creditNote, other.cookie)).status, 403);
    assert.ok(await OrderNotification.findOne({ order: f.order._id, topic: "refund" }));
  });
  await t.test("Approval withdrawal releases a held refund and frees the originally selected units", async () => {
    const f = await fixture(); const made = await create(f); const approved = await decide(made.data._id); assert.equal(approved.status, 200); assert.equal((await decide(made.data._id, "reject")).status, 200); assert.equal((await Refund.findById(approved.data.refund)).status, "failed"); assert.equal((await Order.findById(f.order._id)).refundPendingAmount, 0); assert.equal((await create(f, { items: [{ lineIndex: 0, quantity: 3 }] })).status, 201);
  });
  await t.test("Receipt failure rolls back original SKU stock, case, held refund and credit note", async () => {
    const f = await fixture(); const made = await create(f); await decide(made.data._id); const before = await stock(f);
    await inject(CreditNote, "create", async () => assert.equal((await receive(made.data._id)).status, 500));
    const c = await ItemReturnCase.findById(made.data._id); assert.equal(c.status, "approved"); assert.equal(await stock(f), before); assert.equal((await Refund.findById(c.refund)).status, "awaiting_return"); assert.equal(await CreditNote.countDocuments({ itemCase: c._id }), 0);
    assert.equal((await receive(c._id)).status, 200);
  });
  await t.test("Refund reservation failure compensates approval and leaves no duplicate refund", async () => {
    const f = await fixture(), made = await create(f);
    await inject(Invoice, "findOneAndUpdate", async () => assert.equal((await decide(made.data._id)).status, 500));
    assert.equal((await ItemReturnCase.findById(made.data._id)).status, "requested"); assert.equal(await Refund.countDocuments({ itemCase: made.data._id }), 0); assert.equal((await Order.findById(f.order._id)).refundPendingAmount || 0, 0); assert.equal((await decide(made.data._id)).status, 200);
  });
  await t.test("Whole-order and item-level returns cannot overlap in either direction", async () => {
    const a = await fixture(); await create(a); const legacy = await call("/api/orders/" + a.order._id + "/requests", { type: "return", reason: "Return every purchased item", requestKey: crypto.randomUUID() }, a.cookie); assert.equal(legacy.status, 409);
    const b = await fixture(); assert.equal((await call("/api/orders/" + b.order._id + "/requests", { type: "return", reason: "Return every purchased item", requestKey: crypto.randomUUID() }, b.cookie)).status, 201); assert.equal((await create(b)).status, 409);
  });
  await t.test("A new payment review blocks item approval without reserving money or replacement stock", async () => {
    const f = await fixture(), item = await create(f), exchange = await create(f, { type: "exchange", items: [{ lineIndex: 0, quantity: 1, replacementVariantId: String(f.product.variants[1]._id) }] });
    await Order.updateOne({ _id: f.order._id }, { $set: { paymentStatus: "review" } });
    assert.equal((await decide(item.data._id)).status, 409); assert.equal((await decide(exchange.data._id)).status, 409); assert.equal(await Refund.countDocuments({ order: f.order._id }), 0); assert.equal(await stock(f, 1), 6);
  });
  await t.test("An exchange reserves exactly the replacement SKU and restores it once on rejection", async () => {
    const f = await fixture(), body = { type: "exchange", items: [{ lineIndex: 0, quantity: 2, replacementVariantId: String(f.product.variants[1]._id) }] }; const made = await create(f, body); assert.equal(made.status, 201, JSON.stringify(made.data));
    assert.equal(await stock(f, 1), 6); assert.equal((await decide(made.data._id)).status, 200); assert.equal(await stock(f, 1), 4); assert.equal((await decide(made.data._id)).status, 200); assert.equal(await stock(f, 1), 4);
    assert.equal((await decide(made.data._id, "reject")).status, 200); assert.equal((await decide(made.data._id, "reject")).status, 200); assert.equal(await stock(f, 1), 6); assert.equal(await stock(f, 0), 3); assert.equal(await Refund.countDocuments({ order: f.order._id }), 0);
  });
  await t.test("Exchange receipt and dispatch preserve the original paid order while a priced request can be withdrawn", async () => {
    const f = await fixture(); const priced = await create(f, { type: "exchange", items: [{ lineIndex: 0, quantity: 1, replacementVariantId: String(f.product.variants[2]._id) }] }); assert.equal(priced.status, 201); assert.notEqual(priced.data.exchangeBalance, 0); assert.equal((await decide(priced.data._id, "reject")).status, 200);
    const made = await create(f, { type: "exchange", items: [{ lineIndex: 0, quantity: 1, replacementVariantId: String(f.product.variants[1]._id) }] }); await decide(made.data._id);
    const shipment = { status: "shipped", courierName: "Test Courier", trackingNumber: "EXCHANGE123", trackingUrl: "https://example.com/track", note: "Replacement handed to courier" };
    assert.equal((await call("/api/admin/item-returns/" + made.data._id + "/shipment", shipment)).status, 409);
    assert.equal((await receive(made.data._id, false)).data.status, "ready"); assert.equal(await stock(f), 3); assert.equal(await stock(f, 1), 5);
    assert.equal((await call("/api/admin/item-returns/" + made.data._id + "/shipment", { ...shipment, trackingUrl: "javascript:alert(1)" })).status, 400);
    assert.equal((await call("/api/admin/item-returns/" + made.data._id + "/shipment", shipment)).data.status, "shipped"); assert.equal((await call("/api/admin/item-returns/" + made.data._id + "/shipment", shipment)).status, 200);
    assert.equal((await call("/api/admin/item-returns/" + made.data._id + "/shipment", { status: "delivered", note: "Courier confirmed replacement delivery" })).data.status, "completed");
    assert.equal((await Order.findById(f.order._id)).status, "delivered"); assert.equal((await Invoice.findOne({ order: f.order._id })).totalAmount, f.order.totalAmount); assert.equal(await CreditNote.countDocuments({ itemCase: made.data._id }), 0);
  });
  await t.test("Payment staff can operate item cases but cannot edit inventory or submit another customer's request", async () => {
    const f = await fixture(), staff = await account("staff", ["payments"]), made = await create(f);
    const result = await call("/api/admin/item-returns/" + made.data._id + "/decision", { decision: "approve", note: "Checked by payment staff" }, staff.cookie); assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal((await get("/api/admin/operations/orders/" + f.order._id, staff.cookie)).status, 200); assert.equal((await get("/api/admin/inventory", staff.cookie)).status, 403);
    assert.equal((await call("/api/orders/" + f.order._id + "/item-returns", { type: "return", reason: "Not the order owner", requestKey: crypto.randomUUID(), items: [{ lineIndex: 0, quantity: 1 }] }, staff.cookie)).status, 403);
  });
  await t.test("A fully discounted item produces a settled zero credit without initiating a payment refund", async () => {
    const f = await fixture({ quantity: 1, discount: 100 }); const made = await create(f); assert.equal(made.status, 201); assert.equal(made.data.creditAmount, 0);
    assert.equal((await decide(made.data._id)).status, 200); const received = await receive(made.data._id); assert.equal(received.status, 200); assert.equal(received.data.status, "completed");
    const credit = await CreditNote.findById(received.data.creditNote); assert.equal(credit.totalAmount, 0); assert.equal(credit.status, "settled"); assert.equal(await Refund.countDocuments({ itemCase: made.data._id }), 0);
  });
  await t.test("An exchange cannot reserve a sold-out replacement and a failed approval leaves its case unchanged", async () => {
    const f = await fixture(); const made = await create(f, { type: "exchange", items: [{ lineIndex: 0, quantity: 1, replacementVariantId: String(f.product.variants[1]._id) }] }); assert.equal(made.status, 201);
    const current = await Product.findById(f.product._id); const variants = current.variants.map((v, index) => ({ ...(v.toObject?.() || v), ...(index === 1 ? { stock: 0 } : {}) }));
    await Product.updateOne({ _id: current._id }, { $set: { variants, stock: 8 } }); assert.equal((await decide(made.data._id)).status, 409); assert.equal((await ItemReturnCase.findById(made.data._id)).status, "requested"); assert.equal(await stock(f), 3);
  });
  await t.test("Real-payment item refunds retry only confirmed failure and settle the same credit note", async () => {
    const gateway = require("../services/sslcommerzService"), original = Object.fromEntries(["isConfigured", "validatePayment", "initiateRefund", "queryRefund"].map((k) => [k, gateway[k]]));
    let count = 0, mode = "fail"; const charges = new Map(), accepted = new Map();
    gateway.isConfigured = () => true; gateway.validatePayment = async (id) => charges.get(id);
    gateway.initiateRefund = async (r) => { count++; if (mode === "fail") return { APIConnect: "FAILED" }; if (mode === "unknown") throw new Error("Simulated provider timeout"); const data = { APIConnect: "DONE", status: "refunded", tran_id: r.originalTransactionId, bank_tran_id: r.bankTransactionId, refund_ref_id: "ITEM-" + r.transactionId, refund_amount: r.amount, currency: r.currency }; accepted.set(data.refund_ref_id, data); return { ...data, status: "success" }; };
    gateway.queryRefund = async (ref) => accepted.get(ref);
    const online = async () => { const f = await fixture(); const transactionId = "ITEM-" + crypto.randomBytes(8).toString("hex"), validationId = "VAL-" + transactionId, bankTransactionId = "BANK-" + transactionId; const payment = await models.Payment.create({ order: f.order._id, user: f.user._id, gateway: "sslcommerz", transactionId, validationId, bankTransactionId, amount: f.order.totalAmount, currency: "BDT", status: "paid", riskLevel: 0 }); charges.set(validationId, { status: "VALID", tran_id: transactionId, val_id: validationId, bank_tran_id: bankTransactionId, amount: payment.amount, currency: "BDT", risk_level: 0 }); await Order.updateOne({ _id: f.order._id }, { $set: { paymentMethod: "sslcommerz", transactionId, paidTransactionId: transactionId, settledPayment: payment._id, settledValidationId: validationId, settledBankTransactionId: bankTransactionId } }); return f; };
    try {
      const f = await online(), made = await create(f); const approved = await decide(made.data._id); assert.equal(approved.status, 200); assert.equal(count, 0); const received = await receive(made.data._id); assert.equal(received.status, 200); assert.equal((await Refund.findById(approved.data.refund)).status, "failed"); const creditId = received.data.creditNote; assert.equal((await CreditNote.findById(creditId)).status, "pending");
      mode = "success"; const retryBody = { requestKey: crypto.randomUUID(), note: "Provider confirmed the first refund failed" }; const retry = await call("/api/admin/item-returns/" + made.data._id + "/retry-refund", retryBody); assert.equal(retry.status, 200, JSON.stringify(retry.data)); assert.equal(count, 2); assert.equal((await Refund.findById(retry.data.refund)).status, "pending");
      await require("../services/refundService").processRefund(retry.data.refund); assert.equal((await ItemReturnCase.findById(made.data._id)).status, "completed"); assert.equal((await CreditNote.findById(creditId)).status, "settled"); assert.equal(await CreditNote.countDocuments({ itemCase: made.data._id }), 1); await require("../services/refundService").processRefund(retry.data.refund); assert.equal(count, 2); assert.equal((await call("/api/admin/item-returns/" + made.data._id + "/retry-refund", retryBody)).status, 200); assert.equal(count, 2);
      mode = "unknown"; const g = await online(), gcase = await create(g); await decide(gcase.data._id); const greceived = await receive(gcase.data._id); assert.equal(greceived.status, 200); assert.equal((await Refund.findById(greceived.data.refund)).status, "unknown"); const before = count; assert.equal((await call("/api/admin/item-returns/" + gcase.data._id + "/retry-refund", { requestKey: crypto.randomUUID(), note: "Must not submit an unknown refund" })).status, 409); assert.equal(count, before);
    } finally { Object.assign(gateway, original); }
  });
  await t.test("New order policy snapshots survive later store setting changes", async () => {
    const f = await fixture(), before = await get("/api/admin/store-settings"); assert.equal(f.order.returnPolicy.returnWindowDays, 30);
    const updated = await call("/api/admin/store-settings", { revision: before.data.revision, returnWindowDays: 0, exchangeEnabled: false }, adminCookie, "PUT"); assert.equal(updated.status, 200);
    assert.equal((await create(f)).status, 201); const g = await fixture(); assert.equal(g.order.returnPolicy.returnWindowDays, 0); assert.equal((await create(g)).status, 409);
    assert.equal((await call("/api/admin/store-settings", { revision: updated.data.revision, returnWindowDays: 30, exchangeEnabled: true }, adminCookie, "PUT")).status, 200);
  });
};

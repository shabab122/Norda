const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const jwt = require("jsonwebtoken");
module.exports = async (t, { models, request }) => {
  const { User, Product, Category, Order, Invoice, Upload, CourierBooking, CourierEvent } = models;
  const carrier = require("../services/ecourierService"), courier = require("../services/courierService"), cloud = require("../services/cloudinaryService"), media = require("../services/mediaService"), ops = require("../services/operationsService");
  const originalCarrier = Object.fromEntries(["configuration", "packages", "book", "track", "label", "cancel"].map((k) => [k, carrier[k]])); const originalCloud = Object.fromEntries(["configuration", "upload", "inspect", "destroy"].map((k) => [k, cloud[k]])); const fetchOriginal = global.fetch;
  const cookie = (u) => "norda_token=" + jwt.sign({ id: String(u._id), version: u.tokenVersion || 0 }, process.env.JWT_SECRET);
  const admin = await User.create({ name: "Operations admin", email: crypto.randomUUID() + "@example.com", password: "AdminPassword123", role: "admin" }), adminCookie = cookie(admin);
  const call = (url, body, auth = adminCookie, method = "POST") => request(url, { method, body, cookie: auth }); const get = (url, auth = adminCookie) => request(url, { cookie: auth });
  const packages = [{ code: "#100", name: "Assigned parcel", shippingCharge: 80, weight: "Up to 1kg", coverage: "Dhaka", deliveryTime: "Next day" }], parcels = new Map(), resources = new Map(), files = [];
  let bookCalls = 0, cloudDeletes = 0, cloudMode = "local", loseBooking = false, loseCloud = false, auto = false, autoAfter = new Date(), carrierConfigured = true;
  carrier.configuration = () => ({ ready: carrierConfigured, provider: "ecourier", mode: "sandbox", auto, autoAfter, packageCode: "#100" }); carrier.packages = async () => packages;
  const timestamp = (offset = 0) => new Date(Date.now() - 10000 + offset).toISOString();
  carrier.book = async (payload) => { bookCalls++; const ID = "ECR" + crypto.randomBytes(8).toString("hex"); parcels.set(payload.product_id, { REFID: ID, product_id: payload.product_id, r_mobile: payload.recipient_mobile, product_price: payload.product_price, shipping_price: "80.00", cod: 10, status: [["Initiated", "Parcel accepted", timestamp()]] }); if (loseBooking) { const e = new Error("Simulated timeout"); e.uncertain = true; throw e; } return { response_code: 200, ID }; };
  carrier.track = async (reference) => ({ response_code: 200, query_data: parcels.has(reference) ? [parcels.get(reference)] : "No Data Found" });
  carrier.label = async (id) => "https://staging.ecourier.com.bd/invoices/" + id + ".pdf";
  carrier.cancel = async (id) => { const p = [...parcels.values()].find((p) => p.REFID === id); p.status.push(["Cancelled", "Before pickup", timestamp(8000)]); return { success: true }; };
  cloud.configuration = () => ({ storage: cloudMode, ready: true, cloudName: "norda-tests" });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm6kAAAAASUVORK5CYII=", "base64");
  cloud.upload = async (file, id) => { const data = { cloudName: "norda-tests", cloudPublicId: id, cloudAssetId: "asset-" + crypto.randomUUID(), cloudUrl: "https://res.cloudinary.com/norda-tests/image/upload/v1/" + id + ".png", cloudVersion: 1 }; resources.set(id, data); if (loseCloud) { const e = new Error("Cloud timeout"); e.statusCode = 502; e.uncertain = true; throw e; } return data; }; cloud.inspect = async (a) => resources.get(a.cloudPublicId) || null; cloud.destroy = async (a) => { cloudDeletes++; resources.delete(a.cloudPublicId); return { result: "ok" }; };
  const fixture = async () => { const key = crypto.randomBytes(6).toString("hex"), user = await User.create({ name: "A careful buyer", email: key + "@example.com", password: "BuyerPassword123" }), category = await Category.create({ name: key, slug: key }); const product = await Product.create({ name: 'Item "' + key + '"', description: "A considered everyday product.", slug: key, category: category._id, price: 1000, stock: 10, images: ["/assets/norda-hero-v2.png"], variants: [], isArchived: false }); const f = { user, product, cookie: cookie(user) }; assert.equal((await call("/api/cart", { productId: String(product._id), quantity: 2 }, f.cookie)).status, 201); const made = await call("/api/orders", { shippingAddress: { line1: "12 Test Road", city: "Dhaka", district: "Dhaka", postCode: "1205", phone: "01712345678", thana: "Dhanmondi", area: "Dhanmondi" }, checkoutKey: crypto.randomUUID() }, f.cookie); assert.equal(made.status, 201, JSON.stringify(made.data)); f.order = made.data; assert.equal((await call("/api/orders/" + f.order._id + "/status", { status: "processing" }, adminCookie, "PUT")).status, 200); return f; };
  const bookingBody = (extra = {}) => ({ packageCode: "#100", expectedShippingCharge: 80, requestKey: crypto.randomUUID(), ...extra });
  const book = (f, body = bookingBody(), auth = adminCookie) => call("/api/admin/courier/orders/" + f.order._id + "/book", body, auth);
  const agedUpload = async (extra = {}) => { const filename = "fixture-" + crypto.randomUUID() + ".png", target = path.join(__dirname, "../uploads", filename); await fs.writeFile(target, png); files.push(target); return Upload.create({ uploadedBy: admin._id, originalName: "fixture.png", filename, url: "/uploads/" + filename, mimeType: "image/png", size: png.length, status: "active", storage: "local", createdAt: new Date(Date.now() - 10 * 86400000), ...extra }); };
  const upload = async () => { const form = new FormData(); form.append("image", new Blob([png], { type: "image/png" }), "cloud.png"); return request("/api/uploads", { method: "POST", cookie: adminCookie, body: form, isForm: true }); };
  const inject = async (Model, method, action) => { const original = Model[method]; let fired = false; Model[method] = function (...args) { if (!fired) { fired = true; throw new Error("Injected production write failure"); } return original.apply(this, args); }; try { return await action(); } finally { Model[method] = original; } };
  try {
    process.env.SITE_URL = "https://norda.example";
    await t.test("Courier/media/system tools enforce scopes and keep configuration secrets private", async () => {
      const f = await fixture();
      for (const url of ["/api/admin/courier/config", "/api/admin/courier/bookings", "/api/admin/media", "/api/admin/media/cleanup", "/api/admin/system/status", "/api/admin/system/events"]) { assert.equal((await get(url, "")).status, 401); assert.equal((await get(url, f.cookie)).status, 403); }
      const staff = await User.create({ name: "Shipping staff", email: crypto.randomUUID() + "@example.com", password: "StaffPassword123", role: "staff", permissions: ["orders"] }); assert.equal((await get("/api/admin/courier/config", cookie(staff))).status, 200); assert.equal((await get("/api/admin/system/status", cookie(staff))).status, 403); assert.equal((await get("/api/admin/media", cookie(staff))).status, 403);
      assert.doesNotMatch(JSON.stringify((await get("/api/admin/courier/config")).data), /apiKey|secret|password|USER-ID/i);
    });
    await t.test("SEO returns product metadata/JSON-LD in initial HTML, canonical URLs and private-page noindex", async () => {
      const f = await fixture(); const p = await get("/product-detail.html?id=" + f.product._id, ""); assert.equal(p.status, 200); assert.match(p.data, /application\/ld\+json/); assert.match(p.data, /rel="canonical" href="https:\/\/norda.example\/product-detail.html\?id=/); assert.match(p.data, /&quot;/); const data = JSON.parse(p.data.match(/<script type="application\/ld\+json"[^>]*>([^]*?)<\/script>/)[1]); assert.equal(data.name, f.product.name); assert.equal(data.offers.priceCurrency, "BDT"); assert.equal(data.offers.price, "1000.00"); assert.equal((p.data.match(/<title>/g) || []).length, 1);
      const robots = await get("/robots.txt", ""); assert.match(robots.data, /Disallow: \/admin\//); assert.match(robots.data, /Sitemap: https:\/\/norda.example\/sitemap.xml/);
      const sitemap = await get("/sitemap.xml", ""); assert.equal(sitemap.status, 200); assert.match(sitemap.data, /sitemapindex/); const products = await get("/sitemaps/products-1.xml", ""); assert.ok(products.data.includes(String(f.product._id)));
      assert.match((await get("/security.html", "")).robots, /noindex/); await Product.updateOne({ _id: f.product._id }, { $set: { isArchived: true } }); assert.equal((await get("/product-detail.html?id=" + f.product._id, "")).status, 410); assert.ok(!(await get("/sitemaps/products-1.xml", "")).data.includes(String(f.product._id))); assert.equal((await get("/product-detail.html?id=bad", "")).status, 400);
    });
    await t.test("Queued booking replays one intent and carrier submission does not mark a parcel picked up", async () => {
      const f = await fixture(), body = bookingBody(), made = await book(f, body); assert.equal(made.status, 202, JSON.stringify(made.data)); const before = bookCalls; assert.equal((await book(f, body)).data._id, made.data._id); assert.equal((await book(f, { ...body, expectedShippingCharge: 81 })).status, 409); assert.equal((await book(f)).status, 409);
      await courier.processBooking(made.data._id); assert.equal(bookCalls, before + 1); await courier.processBooking(made.data._id); assert.equal(bookCalls, before + 1); const order = await Order.findById(f.order._id); assert.equal(order.status, "processing"); assert.equal(order.shipment.trackingNumber.startsWith("ECR"), true); assert.equal((await Invoice.findOne({ order: order._id })).totalAmount, 2120);
      const label = await call("/api/admin/courier/bookings/" + made.data._id + "/label", {}); assert.equal(label.status, 200); assert.match(label.data.labelUrl, /^https:\/\/staging.ecourier.com.bd\/invoices\//);
      carrierConfigured = false; assert.equal((await book(f, body)).status, 202); carrierConfigured = true;
    });
    await t.test("Lost booking responses reconcile the original reference without submitting another parcel", async () => {
      const f = await fixture(), made = await book(f); loseBooking = true; const before = bookCalls; await courier.processBooking(made.data._id); loseBooking = false; assert.equal((await CourierBooking.findById(made.data._id)).status, "unknown"); await courier.processBooking(made.data._id); assert.equal(bookCalls, before + 1); const synced = await call("/api/admin/courier/bookings/" + made.data._id + "/sync", {}); assert.equal(synced.status, 200, JSON.stringify(synced.data)); assert.equal(synced.data.status, "booked"); assert.equal(bookCalls, before + 1);
    });
    await t.test("A local invoice write failure after provider acceptance remains reconcilable and never resubmits", async () => {
      const f = await fixture(), made = await book(f), before = bookCalls; await inject(Invoice, "findOneAndUpdate", async () => assert.rejects(courier.processBooking(made.data._id))); assert.equal((await CourierBooking.findById(made.data._id)).status, "unknown"); assert.equal(bookCalls, before + 1); assert.equal((await call("/api/admin/courier/bookings/" + made.data._id + "/sync", {})).status, 200); assert.equal(bookCalls, before + 1);
    });
    await t.test("Carrier pickup/delivery synchronizes COD payment/invoice once and repeated history is monotonic", async () => {
      const f = await fixture(), made = await book(f); await courier.processBooking(made.data._id); const b = await CourierBooking.findById(made.data._id), row = parcels.get(b.reference); row.status.push(["Picked Up", "Collected from merchant", timestamp(1000)], ["In Transit", "Moving to destination", timestamp(2000)], ["On the way to Delivery", "Out for delivery", timestamp(3000)], ["Delivered", "Delivery confirmed", timestamp(4000)]);
      assert.equal((await call("/api/admin/courier/bookings/" + b._id + "/sync", {})).status, 200); const order = await Order.findById(f.order._id), invoice = await Invoice.findOne({ order: order._id }); assert.equal(order.status, "delivered"); assert.equal(order.isPaid, true); assert.equal(invoice.paymentStatus, "paid"); const count = await CourierEvent.countDocuments({ booking: b._id }); await courier.syncBooking(b._id); assert.equal(await CourierEvent.countDocuments({ booking: b._id }), count); assert.equal((await Product.findById(f.product._id)).stock, 8);
      const publicView = await get("/api/orders/" + order._id + "/courier", f.cookie); assert.equal(publicView.status, 200); assert.doesNotMatch(JSON.stringify(publicView.data), /recipient_mobile|product_price|payload|labelUrl|reference/);
      const other = await fixture(); assert.equal((await get("/api/orders/" + order._id + "/courier", other.cookie)).status, 403);
    });
    await t.test("Partial/failed delivery is an exception, not full payment or automatic restocking", async () => {
      const f = await fixture(), made = await book(f); await courier.processBooking(made.data._id); const b = await CourierBooking.findById(made.data._id), row = parcels.get(b.reference); row.status.push(["Picked Up", "Pickup", timestamp(1000)], ["Partially Delivered", "Recipient refused one item", timestamp(2000)]); await courier.syncBooking(b._id); const order = await Order.findById(f.order._id); assert.equal(order.status, "shipped"); assert.equal(order.isPaid, false); assert.equal((await Product.findById(f.product._id)).stock, 8); assert.equal((await CourierBooking.findById(b._id)).exceptionStatus, "open"); assert.equal((await call("/api/admin/courier/bookings/" + b._id + "/resolve", { note: "Discussed partial delivery with customer care" })).status, 200); await courier.syncBooking(b._id); assert.equal((await CourierBooking.findById(b._id)).exceptionStatus, "resolved");
    });
    await t.test("Carrier identity/amount mismatch blocks tracking fulfillment", async () => {
      const f = await fixture(), made = await book(f); await courier.processBooking(made.data._id); const b = await CourierBooking.findById(made.data._id), row = parcels.get(b.reference); row.product_price = 1; row.status.push(["Delivered", "Wrong collection", timestamp(4000)]); assert.equal((await call("/api/admin/courier/bookings/" + b._id + "/sync", {})).status, 409); assert.equal((await Order.findById(f.order._id)).isPaid, false);
    });
    await t.test("Active carrier parcels block order cancellation until confirmed carrier cancellation", async () => {
      const f = await fixture(), made = await book(f); await courier.processBooking(made.data._id); assert.equal((await call("/api/orders/" + f.order._id + "/status", { status: "cancelled" }, adminCookie, "PUT")).status, 409); assert.equal((await Product.findById(f.product._id)).stock, 8); assert.equal((await call("/api/admin/courier/bookings/" + made.data._id + "/cancel", { confirmed: true, note: "Customer cancelled before parcel pickup" })).status, 200); assert.equal((await call("/api/orders/" + f.order._id + "/status", { status: "cancelled" }, adminCookie, "PUT")).status, 200); assert.equal((await Product.findById(f.product._id)).stock, 10);
    });
    await t.test("Fractional COD and unconfigured prepaid mappings are rejected without rounding or shipping", async () => {
      const f = await fixture(); await Order.updateOne({ _id: f.order._id }, { $set: { totalAmount: 2119.99 } }); assert.equal((await book(f)).status, 409); await Order.updateOne({ _id: f.order._id }, { $set: { isPaid: true, paymentStatus: "paid", totalAmount: 2120, paymentMethod: "sslcommerz" } }); assert.equal((await book(f)).status, 409); assert.equal(await CourierBooking.countDocuments({ order: f.order._id }), 0);
    });
    await t.test("Opt-in automatic booking uses the configured cutoff/package and never submits an order twice", async () => {
      autoAfter = new Date(); const f = await fixture(); auto = true;
      try { const before = bookCalls; await courier.sweepCourier(); const b = await CourierBooking.findOne({ order: f.order._id }); assert.ok(b); assert.equal(b.status, "booked"); assert.equal(bookCalls, before + 1); await courier.sweepCourier(); assert.equal(bookCalls, before + 1); } finally { auto = false; }
    });
    await t.test("Confirmed prepaid mapping sends zero collection while preserving the paid invoice", async () => {
      const f = await fixture(); process.env.ECOURIER_PREPAID_METHOD = "MPAY"; process.env.ECOURIER_PREPAID_CONFIRMED = "true"; process.env.ECOURIER_PGW_ID = "test-merchant-mapping";
      try { const o = await Order.findByIdAndUpdate(f.order._id, { $set: { isPaid: true, paymentStatus: "paid", paymentMethod: "sslcommerz", paidTransactionId: "PAID-ORIGINAL-REFERENCE" } }, { new: true }); await require("../services/invoiceService").syncInvoicePayment(o); const made = await book(f); assert.equal(made.status, 202); assert.equal(made.data.payload.product_price, 0); assert.equal(made.data.payload.pgwtxn_id, "PAID-ORIGINAL-REFERENCE"); await courier.processBooking(made.data._id); assert.equal((await Invoice.findOne({ order: f.order._id })).totalAmount, 2120); } finally { delete process.env.ECOURIER_PREPAID_METHOD; delete process.env.ECOURIER_PREPAID_CONFIRMED; delete process.env.ECOURIER_PGW_ID; }
    });
    await t.test("Queued API bookings prevent an independent manual dispatch from creating a second parcel", async () => {
      const f = await fixture(), made = await book(f); assert.equal(made.status, 202); const result = await call("/api/orders/" + f.order._id + "/status", { status: "shipped" }, adminCookie, "PUT"); assert.equal(result.status, 409); assert.equal((await Order.findById(f.order._id)).status, "processing");
    });
    await t.test("Cloud uploads activate only after persistence and uncertain uploads reconcile by owned identity", async () => {
      cloudMode = "cloudinary"; const uploaded = await upload(); assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data)); assert.match(uploaded.data.url, /^https:\/\/res.cloudinary.com\/norda-tests\//); assert.equal((await Upload.findById(uploaded.data._id)).status, "active");
      loseCloud = true; const failed = await upload(); loseCloud = false; assert.equal(failed.status, 500 + 2); const pending = await Upload.findOne({ status: "unknown", storage: "cloudinary" }); assert.ok(pending); files.push(media.localPath(pending.filename)); assert.equal((await call("/api/admin/media/" + pending._id + "/reconcile", {})).status, 200); assert.equal((await Upload.findById(pending._id)).status, "active");
    });
    await t.test("Legacy local migration preserves old URLs and redirects them to durable cloud media", async () => {
      const a = await agedUpload(); const result = await call("/api/admin/media/" + a._id + "/migrate", {}); assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.url, a.url); assert.equal(result.data.storage, "cloudinary"); const redirect = await request(a.url, { redirect: "manual" }); assert.equal(redirect.status, 307); assert.match(redirect.location, /^https:\/\/res.cloudinary.com\/norda-tests\//);
    });
    await t.test("Cleanup preserves current, variant and historical purchase references and rejects stale previews", async () => {
      const f = await fixture(), a = await agedUpload(); const candidate = (await get("/api/admin/media/cleanup")).data.items.find((x) => x._id === String(a._id)); assert.ok(candidate);
      await Product.updateOne({ _id: f.product._id }, { $set: { images: [a.url] } }); assert.equal((await call("/api/admin/media/" + a._id + "/cleanup", { confirmed: true, confirmation: candidate.confirmation })).status, 409);
      await Product.updateOne({ _id: f.product._id }, { $set: { images: [], variants: [{ _id: crypto.randomBytes(12).toString("hex"), sku: "MEDIA-" + crypto.randomBytes(6).toString("hex"), size: "M", price: 1000, stock: 1, images: [a.url] }] } }); assert.equal(await media.isReferenced(await Upload.findById(a._id)), true);
      await Product.updateOne({ _id: f.product._id }, { $set: { images: [], variants: [] } }); const o = await Order.findById(f.order._id); await Order.updateOne({ _id: o._id }, { $set: { items: o.items.map((v) => ({ ...(v.toObject?.() || v), image: a.url })) } }); assert.equal(await media.isReferenced(await Upload.findById(a._id)), true); assert.ok(!(await get("/api/admin/media/cleanup")).data.items.some((x) => x._id === String(a._id)));
    });
    await t.test("Unused aged image cleanup is explicit, guarded and idempotent", async () => {
      const a = await agedUpload(); const c = (await get("/api/admin/media/cleanup")).data.items.find((x) => x._id === String(a._id)); assert.ok(c); assert.equal((await call("/api/admin/media/" + a._id + "/cleanup", { confirmation: c.confirmation })).status, 400); const result = await call("/api/admin/media/" + a._id + "/cleanup", { confirmed: true, confirmation: c.confirmation }); assert.equal(result.status, 200); assert.equal(result.data.status, "deleted"); assert.equal(await fs.stat(media.localPath(a.filename)).catch(() => null), null); assert.equal((await call("/api/admin/media/" + a._id + "/cleanup", { confirmed: true, confirmation: c.confirmation })).status, 200);
      assert.equal((await call("/api/products", { name: "Bad image revive", images: [a.url] })).status, 409);
    });
    await t.test("Cloud transformed URL references protect their original managed asset", async () => {
      const a = await agedUpload({ storage: "cloudinary", cloudName: "norda-tests", cloudPublicId: "norda/uploads/" + crypto.randomUUID(), cloudAssetId: "cloud-owned", cloudUrl: "" }); const f = await fixture(); const transformed = "https://res.cloudinary.com/norda-tests/image/upload/c_fill,w_300/v1/" + a.cloudPublicId + ".webp"; await Product.updateOne({ _id: f.product._id }, { $set: { images: [transformed] } }); assert.equal(await media.isReferenced(await Upload.findById(a._id)), true);
    });
    await t.test("Backup maintenance rejects new writes temporarily and releases the store afterward", async () => {
      const f = await fixture(); const data = await require("../services/maintenanceService").withBackupGate(async () => { const denied = await call("/api/cart", { productId: String(f.product._id), quantity: 1 }, f.cookie); assert.equal(denied.status, 503); assert.equal(denied.retryAfter, "30"); return true; }); assert.equal(data, true); assert.equal((await call("/api/cart", { productId: String(f.product._id), quantity: 1 }, f.cookie)).status, 201);
    });
    await t.test("A backup that cannot drain writes preserves the live lease until that operation finishes", async () => {
      const maintenance = require("../services/maintenanceService"), Gate = require("../models/MaintenanceGate");
      const release = await maintenance.acquireWriter();
      try {
        await assert.rejects(maintenance.withBackupGate(() => assert.fail("Backup must wait for active writes"), { drainMs: 0 }), /Active writes/);
        const held = await Gate.findById("store");
        assert.equal(held.mode, "open"); assert.ok(held.writers.some((w) => +new Date(w.expiresAt) > Date.now()));
        await assert.rejects(maintenance.withBackupGate(() => assert.fail("The still-running write cannot disappear"), { drainMs: 0 }), /Active writes/);
      } finally { await release(); }
      assert.equal(await maintenance.withBackupGate(async () => "consistent", { drainMs: 0 }), "consistent");
    });
    await t.test("Captured API errors omit secrets, submitted data and raw error messages", async () => {
      const logged = [], old = console.error; console.error = (v) => logged.push(v);
      try { await ops.captureError(new Error("hidden-password hidden-body hidden-token"), { route: { path: "/:id/production-test" }, baseUrl: "/api/admin", method: "POST", requestId: "safe-request-id", body: { password: "hidden-body" } }); }
      finally { console.error = old; }
      const rows = await get("/api/admin/system/events");
      const item = rows.data.items.find((x) => x.requestId === "safe-request-id");
      assert.ok(item); assert.doesNotMatch(JSON.stringify([item, logged]), /hidden-password|hidden-body|hidden-token/);
    });
    await t.test("Operational email previews are recorded as file delivery rather than inbox delivery", async () => {
      const mail = require("../services/mailService"), old = mail.sendAccountMail;
      process.env.OPS_ALERT_EMAIL = "ops@example.test"; let sent = 0;
      mail.sendAccountMail = async () => { sent++; return { delivery: "local" }; };
      try {
        await ops.recordEvent({ kind: "TEST_LOCAL_ALERT", summary: "An operational preview" }); await ops.deliverAlerts();
        const item = (await get("/api/admin/system/events")).data.items.find((x) => x.kind === "TEST_LOCAL_ALERT");
        assert.equal(sent, 1); assert.equal(item.alertTransport, "file"); assert.equal(item.alertStatus, "sent");
      } finally { mail.sendAccountMail = old; delete process.env.OPS_ALERT_EMAIL; }
    });
    await t.test("Operational events deduplicate per hour and monitoring excludes secret/error bodies", async () => {
      await ops.recordEvent({ kind: "TEST_OPERATIONAL_SIGNAL", summary: "A bounded operational signal", route: "system:test" }); await ops.recordEvent({ kind: "TEST_OPERATIONAL_SIGNAL", summary: "A bounded operational signal", route: "system:test" }); const rows = await get("/api/admin/system/events"); const item = rows.data.items.find((x) => x.kind === "TEST_OPERATIONAL_SIGNAL"); assert.equal(item.count, 2); assert.equal((await call("/api/admin/system/events/" + item._id + "/resolve", {})).data.status, "resolved"); const data = await get("/api/admin/system/status"); assert.equal(data.status, 200); assert.doesNotMatch(JSON.stringify(data.data), /apiSecret|JWT_SECRET|MONGO_URI|SMTP_PASS|BACKUP_ENCRYPTION_KEY/);
    });
    await t.test("Operational webhook alerts are bounded and retry without exposing request or credential data", async () => {
      process.env.OPS_ALERT_WEBHOOK_URL = "https://hooks.example.test/operations"; let sent = 0, received;
      global.fetch = async (url, options) => { if (String(url) === process.env.OPS_ALERT_WEBHOOK_URL) { sent++; received = JSON.parse(options.body); return new Response("ok", { status: 200 }); } return fetchOriginal(url, options); };
      await ops.recordEvent({ kind: "TEST_ALERT_SIGNAL", summary: "A provider-neutral operational warning", requestId: crypto.randomUUID(), severity: "warning" }); await ops.deliverAlerts(); assert.equal(sent, 1); assert.equal(received.kind, "TEST_ALERT_SIGNAL"); assert.doesNotMatch(JSON.stringify(received), /password|body|email|secret|token/i); await ops.deliverAlerts(); assert.equal(sent, 1); delete process.env.OPS_ALERT_WEBHOOK_URL; global.fetch = fetchOriginal;
    });
  } finally { Object.assign(carrier, originalCarrier); Object.assign(cloud, originalCloud); global.fetch = fetchOriginal; delete process.env.SITE_URL; delete process.env.OPS_ALERT_WEBHOOK_URL; for (const f of files) await fs.unlink(f).catch(() => {}); }
};

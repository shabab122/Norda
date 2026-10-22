const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
module.exports = async (t, { request, models }) => {
  const { User, Product, Category, Order, Invoice, Cart, Coupon, CouponRedemption, WishlistItem, StoreSettings, InventoryImport } = models;
  const inventory = require("../services/inventoryToolsService"), { rowsToCsv } = require("../utils/csv");
  const gateway = require("../services/sslcommerzService");
  const originalGateway = Object.fromEntries(["isConfigured", "createPaymentSession", "queryPayment"].map((k) => [k, gateway[k]]));
  gateway.isConfigured = () => true;
  gateway.createPaymentSession = async ({ transactionId }) => ({ sessionKey: "TEST-" + transactionId, checkoutUrl: "https://sandbox.sslcommerz.com/test/" + transactionId });
  gateway.queryPayment = async ({ transactionId }) => ({ APIConnect: "DONE", no_of_trans_found: 1, element: [{ tran_id: transactionId, status: "FAILED" }] });
  const cookie = (u) => "norda_token=" + jwt.sign({ id: String(u._id), v: u.tokenVersion || 0 }, process.env.JWT_SECRET);
  const admin = await User.create({ name: "Commerce admin", email: crypto.randomUUID() + "@example.com", password: "AdminPassword123", role: "admin" }), adminCookie = cookie(admin);
  const call = (path, body, auth = adminCookie, method = "POST") => request(path, { method, body, cookie: auth });
  const get = (path, auth = adminCookie) => request(path, { cookie: auth });
  const fixture = async (variants = false) => {
    const key = crypto.randomBytes(6).toString("hex"), user = await User.create({ name: "Commerce buyer", email: key + "@example.com", password: "BuyerPassword123" });
    const category = await Category.create({ name: key, slug: key });
    const product = await Product.create({ name: "Commerce " + key, slug: key, category: category._id, price: 1000, stock: variants ? 10 : 8, isArchived: false, images: [], lowStockThreshold: 3, inventoryVersion: 0,
      variants: variants ? [{ _id: crypto.randomBytes(12).toString("hex"), sku: "NOR-" + key.toUpperCase() + "-M", size: "M", price: 1000, discountPrice: 0, stock: 3, lowStockThreshold: 3, isActive: true }, { _id: crypto.randomBytes(12).toString("hex"), sku: "NOR-" + key.toUpperCase() + "-L", size: "L", price: 1500, stock: 7, lowStockThreshold: 2, isActive: true }] : [] });
    return { user, product, cookie: cookie(user) };
  };
  const coupon = async (fields = {}) => {
    const body = { code: "SAVE-" + crypto.randomBytes(5).toString("hex").toUpperCase(), title: "A considered saving", type: "percentage", value: 10, minSubtotal: 0, maxDiscount: 0, usageLimit: 0, perUserLimit: 1, startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(), isActive: true, isPublic: true, ...fields };
    const result = await call("/api/admin/coupons", body); assert.equal(result.status, 201, JSON.stringify(result.data)); return result.data;
  };
  const add = (f, quantity = 1, variantId = f.product.variants?.[0]?._id) => call("/api/cart", { productId: String(f.product._id), quantity, ...(variantId ? { variantId: String(variantId) } : {}) }, f.cookie);
  const address = { line1: "A quiet road", city: "Dhaka", district: "Dhaka", postCode: "1205", phone: "01712345678" };
  const checkout = (f, c, extra = {}) => call("/api/orders", { shippingAddress: address, checkoutKey: crypto.randomUUID(), ...(c ? { couponCode: c.code } : {}), ...extra }, f.cookie);
  const currentStock = async (f) => (await Product.findById(f.product._id)).stock;
  const makeCsv = (rows) => "\uFEFF" + rowsToCsv(inventory.columns.map((key) => ({ key, label: key })), rows);
  const exportRows = async (f) => { const result = await get("/api/admin/inventory/export.csv?keyword=" + encodeURIComponent(f.product.name)); assert.equal(result.status, 200); return inventory.parseCsv(result.data); };
  const preview = (csv) => call("/api/admin/inventory/preview", { csv });
  const apply = (csv, sourceHash, requestKey = crypto.randomUUID(), auth = adminCookie) => call("/api/admin/inventory/import", { csv, sourceHash, requestKey }, auth);
  const inject = async (Model, method, action, at = 1) => { const original = Model[method]; let count = 0; Model[method] = function (...args) { if (++count === at) throw new Error("Injected commerce write failure"); return original.apply(this, args); }; try { return await action(); } finally { Model[method] = original; } };
  try {
    await t.test("New admin tools and account wishlists reject missing/customer credentials", async () => {
      const f = await fixture();
      for (const path of ["/api/admin/coupons", "/api/admin/inventory", "/api/admin/inventory/export.csv", "/api/admin/store-settings"]) { assert.equal((await get(path, "")).status, 401); assert.equal((await get(path, f.cookie)).status, 403); }
      for (const path of ["/api/admin/inventory/preview", "/api/admin/inventory/import", "/api/admin/coupons"]) assert.equal((await call(path, {}, f.cookie)).status, 403);
      assert.equal((await call("/api/admin/store-settings", {}, f.cookie, "PUT")).status, 403);
      assert.equal((await get("/api/wishlist", "")).status, 401); assert.equal((await get("/api/wishlist/ids", "")).status, 401); assert.equal((await call("/api/coupons/preview", {}, "")).status, 401);
    });
    await t.test("Public configuration reads defaults without creating or reseeding store data", async () => {
      assert.equal(await StoreSettings.countDocuments({}), 0); const config = await get("/api/store/config", ""); assert.equal(config.status, 200); assert.equal(config.data.currency, "BDT"); assert.equal(config.data.revision, 0); assert.equal(await StoreSettings.countDocuments({}), 0);
    });
    await t.test("Coupon center normalizes codes, validates dates/amounts and hides private or expired offers", async () => {
      const c = await coupon({ code: "  save-" + crypto.randomBytes(5).toString("hex") + "  " }); assert.equal(c.code, c.code.trim().toUpperCase());
      const hidden = await coupon({ isPublic: false }), expired = await coupon({ startsAt: new Date(Date.now() - 86400000).toISOString(), endsAt: new Date(Date.now() - 1000).toISOString() });
      const offers = await get("/api/coupons", ""); assert.equal(offers.status, 200); assert.ok(offers.data.some((r) => r.code === c.code)); assert.ok(!offers.data.some((r) => [hidden.code, expired.code].includes(r.code))); assert.equal(offers.data[0].usedCount, undefined);
      for (const fields of [{ value: 101 }, { value: -1 }, { value: 0.001 }, { usageLimit: 1.5 }, { endsAt: c.startsAt }]) assert.equal((await call("/api/admin/coupons", { ...c, code: "BAD-" + crypto.randomBytes(4).toString("hex"), ...fields })).status, 400);
      assert.equal((await call("/api/admin/coupons/" + c._id, { ...c, revision: c.revision + 1 }, adminCookie, "PUT")).status, 409);
    });
    await t.test("Coupon preview uses current selected-SKU prices, rounds/caps savings and writes no redemption", async () => {
      const f = await fixture(true), c = await coupon({ value: 12.5, minSubtotal: 1500, maxDiscount: 200 }); await add(f, 2);
      const result = await call("/api/coupons/preview", { code: c.code, subtotal: 1, discountAmount: 999999 }, f.cookie);
      assert.equal(result.status, 200); assert.equal(result.data.subtotal, 2000); assert.equal(result.data.discountAmount, 200); assert.equal(result.data.totalAmount, 1920); assert.ok(result.data.cartSignature.includes(f.product.variants[0].sku) === false); assert.equal(await CouponRedemption.countDocuments({ coupon: c._id }), 0); assert.equal((await Coupon.findById(c._id)).usedCount, 0);
      const min = await coupon({ minSubtotal: 3000 }); assert.equal((await call("/api/coupons/preview", { code: min.code }, f.cookie)).status, 409);
    });
    await t.test("Coupon checkout/invoice/email use immutable discounted totals and replay one redemption", async () => {
      const f = await fixture(true), c = await coupon({ type: "fixed", value: 250 }); await add(f, 2); const key = crypto.randomUUID();
      const created = await checkout(f, c, { checkoutKey: key, discountAmount: 9000 }); assert.equal(created.status, 201, JSON.stringify(created.data));
      const order = await Order.findById(created.data._id), inv = await Invoice.findOne({ order: order._id }); assert.equal(order.subtotal, 2000); assert.equal(order.discountAmount, 250); assert.equal(order.totalAmount, 1870); assert.equal(inv.totalAmount, 1870); assert.equal(inv.discountAmount, 250); assert.equal(inv.coupon.code, c.code); assert.equal(inv.items[0].lineTotal, 2000);
      await call("/api/admin/coupons/" + c._id, { ...c, value: 500, isActive: false }, adminCookie, "PUT");
      assert.equal((await checkout(f, c, { checkoutKey: key })).status, 200); assert.equal((await Coupon.findById(c._id)).usedCount, 1); assert.equal(await CouponRedemption.countDocuments({ coupon: c._id }), 1); assert.equal((await Invoice.findById(inv._id)).discountAmount, 250);
      assert.equal((await checkout(f, null, { checkoutKey: key })).status, 409);
      const email = await models.OrderNotification.findOne({ order: order._id, topic: "confirmation" }); assert.ok(email.text.includes(c.code)); assert.ok(email.text.includes("250.00"));
    });
    await t.test("Global last-use and per-account limits cannot be exceeded by overlapping checkouts", async () => {
      const a = await fixture(), b = await fixture(), c = await coupon({ usageLimit: 1 }); await add(a); await add(b);
      const outcomes = await Promise.all([checkout(a, c), checkout(b, c)]); assert.equal(outcomes.filter((r) => r.status === 201).length, 1); assert.equal((await Coupon.findById(c._id)).usedCount, 1); assert.equal(await CouponRedemption.countDocuments({ coupon: c._id }), 1);
      const limited = await coupon(); const f = await fixture(); await add(f); assert.equal((await checkout(f, limited)).status, 201); await add(f); assert.equal((await checkout(f, limited)).status, 409); assert.equal((await Cart.findOne({ user: f.user._id })).items.length, 1);
    });
    await t.test("Checkout write failures compensate stock, order, invoice and coupon counters", async () => {
      for (const [Model, method] of [[Invoice, "create"], [Cart, "updateOne"], [CouponRedemption, "create"]]) {
        const f = await fixture(), c = await coupon(); await add(f, 2);
        await inject(Model, method, async () => assert.ok((await checkout(f, c)).status >= 500));
        assert.equal(await currentStock(f), 8); assert.equal(await Order.countDocuments({ user: f.user._id }), 0); assert.equal(await Invoice.countDocuments({ user: f.user._id }), 0); assert.equal((await Coupon.findById(c._id)).usedCount, 0); assert.equal(await CouponRedemption.countDocuments({ coupon: c._id }), 0); assert.equal((await Cart.findOne({ user: f.user._id })).items[0].quantity, 2);
      }
    });
    await t.test("Simulated and real hosted checkout receive the discounted amount", async () => {
      for (const method of ["demo", "sslcommerz"]) {
        const f = await fixture(), c = await coupon({ value: 20 }); await add(f);
        const r = await call("/api/payments/" + method + "/initiate", { couponCode: c.code, shippingAddress: address, checkoutKey: crypto.randomUUID(), ...(method === "demo" ? { channel: "mobile_banking" } : {}) }, f.cookie);
        assert.equal(r.status, 201, JSON.stringify(r.data)); const order = await Order.findById(r.data.orderId), payment = await models.Payment.findOne({ order: order._id }); assert.equal(order.totalAmount, 920); assert.equal(payment.amount, 920); assert.equal((await Coupon.findById(c._id)).usedCount, 1);
      }
    });
    await t.test("Cancellation/expiry and same-order retry retain one coupon use and original invoice", async () => {
      const f = await fixture(), c = await coupon({ type: "fixed", value: 100 }); await add(f);
      const created = await call("/api/payments/sslcommerz/initiate", { couponCode: c.code, shippingAddress: address, checkoutKey: crypto.randomUUID() }, f.cookie), id = created.data.orderId;
      assert.equal(created.status, 201); await Order.updateOne({ _id: id }, { $set: { reservationExpiresAt: new Date(Date.now() - 1000) } }); await require("../services/reservationService").expireReservationForOrder(id);
      assert.equal(await currentStock(f), 8); await call("/api/admin/coupons/" + c._id, { ...c, isActive: false }, adminCookie, "PUT");
      const retry = await call("/api/payments/sslcommerz/" + id + "/retry", { retryKey: crypto.randomUUID() }, f.cookie); assert.equal(retry.status, 200, JSON.stringify(retry.data)); assert.equal((await Order.findById(id)).totalAmount, 1020); assert.equal((await Coupon.findById(c._id)).usedCount, 1); assert.equal(await Invoice.countDocuments({ order: id }), 1);
    });
    await t.test("Wishlists are account scoped, idempotent and reflect current catalog availability", async () => {
      const a = await fixture(), b = await fixture(), path = "/api/wishlist/" + a.product._id;
      assert.equal((await call(path, { user: b.user._id }, a.cookie, "PUT")).status, 200); assert.equal((await call(path, {}, a.cookie, "PUT")).status, 200); assert.equal(await WishlistItem.countDocuments({ user: a.user._id }), 1);
      assert.equal((await get("/api/wishlist", b.cookie)).data.total, 0); assert.equal((await get("/api/wishlist/ids", a.cookie)).data[0], String(a.product._id));
      await Product.updateOne({ _id: a.product._id }, { $set: { price: 1234, isArchived: true } });
      const result = await get("/api/wishlist", a.cookie); assert.equal(result.data.items[0].product.price, 1234); assert.equal(result.data.items[0].unavailable, true);
      const entry = result.data.items[0]._id; await call("/api/wishlist/entries/" + entry, undefined, b.cookie, "DELETE"); assert.equal(await WishlistItem.countDocuments({ user: a.user._id }), 1);
      assert.equal((await call("/api/wishlist/entries/" + entry, undefined, a.cookie, "DELETE")).status, 200); assert.equal(await WishlistItem.countDocuments({ user: a.user._id }), 0);
    });
    await t.test("Saved variants still require a chosen option and can enter the existing cart", async () => {
      const f = await fixture(true); await call("/api/wishlist/" + f.product._id, {}, f.cookie, "PUT");
      assert.equal((await call("/api/cart", { productId: String(f.product._id), quantity: 1 }, f.cookie)).status, 409); assert.equal((await add(f)).status, 201); assert.equal((await Cart.findOne({ user: f.user._id })).items[0].sku, f.product.variants[0].sku); assert.equal(await WishlistItem.countDocuments({ user: f.user._id }), 1);
    });
    await t.test("Inventory export is round-trippable and preview does not alter stock", async () => {
      const f = await fixture(true), rows = await exportRows(f); assert.equal(rows.length, 2); assert.equal(rows[0].expectedStock, 3); rows[0].stock = 9; rows[0].lowStockThreshold = 4; const csv = makeCsv(rows);
      const result = await preview(csv); assert.equal(result.status, 200); assert.equal(result.data.valid, true); assert.equal(result.data.changes[0].to, 9); assert.equal(await currentStock(f), 10); assert.equal(await InventoryImport.countDocuments({}), 0);
      const imp = await apply(csv, result.data.sourceHash); assert.equal(imp.status, 200, JSON.stringify(imp.data)); const product = await Product.findById(f.product._id); assert.equal(product.stock, 16); assert.equal(product.variants[0].stock, 9); assert.equal(product.variants[0].lowStockThreshold, 4); assert.equal(product.variants[1].stock, 7);
      assert.equal((await get("/api/products/" + product._id, "")).data.lastInventoryImport, undefined);
    });
    await t.test("Malformed, repeated, edited-header and fractional CSV rows fail before writes", async () => {
      const f = await fixture(), rows = await exportRows(f), valid = makeCsv(rows);
      for (const csv of [valid.replace('"stock"', '"newStock"'), makeCsv([...rows, ...rows]), makeCsv([{ ...rows[0], stock: -1 }]), makeCsv([{ ...rows[0], stock: 1.5 }]), valid + '\n"unfinished']) assert.equal((await preview(csv)).status, 400);
      assert.equal(await currentStock(f), 8);
    });
    await t.test("Stale exported stock and modified preview hashes cannot overwrite a new checkout", async () => {
      const f = await fixture(true), rows = await exportRows(f); rows[0].stock = 10; const csv = makeCsv(rows), p = await preview(csv);
      assert.equal((await apply(csv + "\n", p.data.sourceHash)).status, 409); await add(f); assert.equal((await checkout(f)).status, 201);
      assert.equal((await preview(csv)).data.valid, false); assert.equal((await apply(csv, p.data.sourceHash)).status, 409); assert.equal((await Product.findById(f.product._id)).variants[0].stock, 2);
    });
    await t.test("Completed imports replay their result once and reject reused keys for other files", async () => {
      const f = await fixture(), rows = await exportRows(f); rows[0].stock = 20; const csv = makeCsv(rows), p = await preview(csv), key = crypto.randomUUID(); const first = await apply(csv, p.data.sourceHash, key); assert.equal(first.status, 200);
      const revision = (await Product.findById(f.product._id)).inventoryVersion; assert.equal((await apply(csv, p.data.sourceHash, key)).data._id, first.data._id); assert.equal((await Product.findById(f.product._id)).inventoryVersion, revision);
      rows[0].stock = 21; const other = makeCsv(rows), hash = crypto.createHash("sha256").update(other).digest("hex"); assert.equal((await apply(other, hash, key)).status, 409);
    });
    await t.test("Interrupted history persistence recovers a completed product write without applying it twice", async () => {
      const f = await fixture(), rows = await exportRows(f); rows[0].stock = 12; const csv = makeCsv(rows), p = await preview(csv), key = crypto.randomUUID();
      await inject(InventoryImport, "updateOne", async () => assert.ok((await apply(csv, p.data.sourceHash, key)).status >= 500), 2);
      assert.equal(await currentStock(f), 12); const revision = (await Product.findById(f.product._id)).inventoryVersion;
      const retry = await apply(csv, p.data.sourceHash, key); assert.equal(retry.status, 200); assert.equal(retry.data.entries[0].status, "applied"); assert.equal((await Product.findById(f.product._id)).inventoryVersion, revision);
    });
    await t.test("Unknown inventory write outcomes become review and are never blindly repeated", async () => {
      const f = await fixture(), rows = await exportRows(f); rows[0].stock = 99; const csv = makeCsv(rows), p = await preview(csv), key = crypto.randomUUID();
      let result; await inject(Product, "findOneAndUpdate", async () => { result = await apply(csv, p.data.sourceHash, key); });
      assert.equal(result.status, 200); assert.equal(result.data.entries[0].status, "review"); assert.equal(await currentStock(f), 8); assert.equal((await apply(csv, p.data.sourceHash, key)).data.entries[0].status, "review"); assert.equal(await currentStock(f), 8);
    });
    await t.test("Discounted paid returns refund the charged total and preserve invoice discounts", async () => {
      const f = await fixture(), c = await coupon({ type: "fixed", value: 250 }); await add(f, 2); const created = await checkout(f, c), id = created.data._id;
      for (const status of ["processing", "shipped", "delivered"]) assert.equal((await call("/api/orders/" + id + "/status", { status }, adminCookie, "PUT")).status, 200);
      const r = await call("/api/orders/" + id + "/requests", { type: "return", reason: "The order did not fit", requestKey: crypto.randomUUID() }, f.cookie); assert.equal(r.status, 201);
      assert.equal((await call("/api/admin/operations/requests/" + r.data._id + "/decision", { decision: "approve", note: "Please return all items" })).status, 200);
      assert.equal((await call("/api/admin/operations/requests/" + r.data._id + "/receive", { received: true, restock: true, note: "All returned items received" })).status, 200);
      const refund = await models.Refund.findOne({ order: id }); assert.equal(refund.amount, 1870);
      assert.equal((await call("/api/admin/operations/refunds/" + refund._id + "/confirm", { confirmed: true, reference: "TEST-REPAYMENT", note: "Test cash repayment receipt recorded" })).status, 200);
      const invoice = await Invoice.findOne({ order: id }); assert.equal(invoice.totalAmount, 1870); assert.equal(invoice.refundedAmount, 1870); assert.equal(invoice.discountAmount, 250); assert.equal((await Coupon.findById(c._id)).usedCount, 1); assert.equal(await currentStock(f), 8);
    });
    await t.test("An inventory race retains successful product updates and reports conflicting products", async () => {
      const a = await fixture(), b = await fixture(); const rows = [...await exportRows(a), ...await exportRows(b)].map((r) => ({ ...r, stock: 20 }));
      const csv = makeCsv(rows), p = await preview(csv), original = Product.findOneAndUpdate; let raced = false;
      Product.findOneAndUpdate = async function (filter, ...args) { if (String(filter._id) === String(b.product._id) && !raced) { raced = true; await Product.updateOne({ _id: b.product._id }, { $inc: { stock: -1, inventoryVersion: 1 } }); } return original.call(this, filter, ...args); };
      try { const result = await apply(csv, p.data.sourceHash); assert.equal(result.status, 200); assert.deepEqual(result.data.entries.map((e) => e.status), ["applied", "conflict"]); assert.equal(await currentStock(a), 20); assert.equal(await currentStock(b), 7); }
      finally { Product.findOneAndUpdate = original; }
    });
    await t.test("Simple-product CSV imports update alert thresholds and escape spreadsheet formulas", async () => {
      const f = await fixture(); await Product.updateOne({ _id: f.product._id }, { $set: { name: '=A1,"everyday"' } }); f.product.name = '=A1,"everyday"';
      const rows = await exportRows(f); assert.ok(rows[0].productName.startsWith("'=")); rows[0].stock = 2; rows[0].lowStockThreshold = 4;
      const csv = makeCsv(rows), p = await preview(csv); assert.equal((await apply(csv, p.data.sourceHash)).status, 200);
      const product = await Product.findById(f.product._id); assert.equal(product.stock, 2); assert.equal(product.lowStockThreshold, 4);
    });
    await t.test("Low-stock alerts use individual thresholds and exclude retired/archived options", async () => {
      const f = await fixture(true); const result = await get("/api/admin/inventory?low=true&keyword=" + encodeURIComponent(f.product.name)); assert.equal(result.data.total, 1); assert.equal(result.data.items[0].sku, f.product.variants[0].sku);
      const product = await Product.findById(f.product._id); const variants = product.variants.map((v) => ({ ...(v.toObject ? v.toObject() : v), isActive: false })); await Product.updateOne({ _id: product._id }, { $set: { variants } });
      assert.equal((await get("/api/admin/inventory?low=true&keyword=" + encodeURIComponent(f.product.name))).data.total, 0);
    });
    await t.test("Settings save with revision checks, publish only public fields and reject unsafe content links", async () => {
      const old = (await get("/api/admin/store-settings")).data;
      const body = { ...old, supportEmail: "support@example.com", supportPhone: "+880 1700 000000", address: "Dhaka\nBangladesh", freeShippingThreshold: 800, flatShippingFee: 80, announcement: { visible: true, text: '<New "offer">', url: "/coupons.html" }, hero: { ...old.hero, title: '<Everyday "edit">' }, faq: [{ question: "Where?", answer: "Across Bangladesh." }], policies: { ...old.policies, delivery: "Delivery details\nSecond line" }, MONGO_URI: "must-not-be-published", SMTP_PASSWORD: "must-not-be-published" };
      const saved = await call("/api/admin/store-settings", body, adminCookie, "PUT"); assert.equal(saved.status, 200, JSON.stringify(saved.data)); assert.equal(saved.data.revision, old.revision + 1); assert.equal((await get("/api/store/config", "")).data.supportEmail, body.supportEmail); assert.ok(!JSON.stringify(saved.data).includes("must-not-be-published")); assert.equal(saved.data.updatedBy, undefined);
      assert.equal((await call("/api/admin/store-settings", body, adminCookie, "PUT")).status, 409);
      for (const url of ["javascript:alert(1)", "//evil.example", "https://user:password@example.com", "/\\evil"]) assert.equal((await call("/api/admin/store-settings", { revision: saved.data.revision, announcement: { visible: true, text: "Offer", url } }, adminCookie, "PUT")).status, 400);
      assert.equal((await call("/api/admin/store-settings", { revision: saved.data.revision, flatShippingFee: -1 }, adminCookie, "PUT")).status, 400);
    });
    await t.test("Discounted subtotal controls configured delivery and stale shown totals cannot place an order", async () => {
      const f = await fixture(), c = await coupon({ value: 30 }); await add(f);
      const quote = await call("/api/coupons/preview", { code: c.code }, f.cookie); assert.equal(quote.data.discountAmount, 300); assert.equal(quote.data.shippingFee, 80); assert.equal(quote.data.totalAmount, 780);
      const totals = Object.fromEntries(["subtotal", "shippingFee", "discountAmount", "totalAmount"].map((k) => [k, quote.data[k]]));
      const cfg = (await get("/api/admin/store-settings")).data; await call("/api/admin/store-settings", { revision: cfg.revision, flatShippingFee: 90 }, adminCookie, "PUT");
      assert.equal((await checkout(f, c, { expectedTotals: totals })).status, 409); assert.equal(await Order.countDocuments({ user: f.user._id }), 0); assert.equal((await Coupon.findById(c._id)).usedCount, 0);
      const result = await checkout(f, c); assert.equal(result.status, 201); assert.equal(result.data.totalAmount, 790);
      await call("/api/admin/store-settings", { revision: cfg.revision + 1, flatShippingFee: 120, freeShippingThreshold: 5000 }, adminCookie, "PUT");
      assert.equal((await Invoice.findOne({ order: result.data._id })).totalAmount, 790);
    });
  } finally { for (const [key, fn] of Object.entries(originalGateway)) gateway[key] = fn; }
};

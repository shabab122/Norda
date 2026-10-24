const assert = require("node:assert/strict"), crypto = require("node:crypto"), jwt = require("jsonwebtoken");
module.exports = async function journeys(t, { request, models: M, fail }) {
  const key = () => crypto.randomUUID(); const address = { line1: "Acceptance Road 12", city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678", country: "Bangladesh" };
  const account = async (role = "user", verified = true) => { const user = await M.User.create({ name: role + " acceptance", email: crypto.randomBytes(7).toString("hex") + "@example.test", password: "AcceptancePassword123", role, emailVerifiedAt: verified ? new Date() : null }); return { user, cookie: "norda_token=" + jwt.sign({ id: String(user._id), version: 0 }, process.env.JWT_SECRET) }; };
  const admin = await account("admin"), buyer = await account(), other = await account();
  const category = await M.Category.create({ name: "Expansion acceptance", slug: "expansion-acceptance" });
  const product = async (stock = 5, price = 100) => M.Product.create({ name: "Acceptance item " + key(), slug: "expansion-" + key(), category: category._id, price, stock, images: ["/assets/products/photos/notebook.webp"] });
  const call = (url, body, cookie = buyer.cookie, method = "POST") => request(url, { method, body, cookie });
  const get = (url, cookie = buyer.cookie) => request(url, { cookie });
  const expect = (r, code = 200) => { assert.equal(r.status, code, JSON.stringify(r.data)); return r.data; };
  async function delivered({ quantity = 2, discount = 20 } = {}) {
    const user = await account(), ids = [1, 2, 3].map(() => new (require("mongoose").Types.ObjectId)());
    const p = await M.Product.create({ name: "Exchange shirt " + key(), slug: "exchange-" + key(), category: category._id, images: ["/assets/products/photos/jacket.webp"], price: 50, stock: 17, variants: [{ _id: ids[0], sku: "OLD-" + key(), size: "M", color: "Forest", price: 100, stock: 5, isActive: true }, { _id: ids[1], sku: "HIGH-" + key(), size: "L", color: "Forest", price: 200, stock: 6, isActive: true }, { _id: ids[2], sku: "LOW-" + key(), size: "S", color: "Cream", price: 50, stock: 6, isActive: true }] });
    const order = await M.Order.create({ user: user.user._id, items: [{ product: p._id, variantId: ids[0], sku: p.variants[0].sku, name: p.name, price: 100, quantity, image: p.images[0] }], shippingAddress: address, subtotal: 100 * quantity, discountAmount: discount, shippingFee: 120, totalAmount: 100 * quantity - discount + 120, currency: "BDT", paymentMethod: "cod", status: "delivered", paymentStatus: "paid", isPaid: true, paidAt: new Date(), shipment: { deliveredAt: new Date() }, returnPolicy: { returnWindowDays: 30, exchangeEnabled: true } });
    const invoice = await require("../services/invoiceService").createInvoiceForOrder(order);
    return { p, ids, order, invoice, ...user };
  }
  const createCase = (f, type = "exchange", option = 1, quantity = 2, extras = {}) => call("/api/orders/" + f.order._id + "/item-returns", { type, requestKey: key(), reason: "Please replace the selected merchandise", items: [{ lineIndex: 0, quantity, ...(type === "exchange" ? { replacementVariantId: String(f.ids[option]) } : {}), ...extras }] }, f.cookie);
  const decide = (id, decision = "approve") => call("/api/admin/item-returns/" + id + "/decision", { decision, note: "The request has been inspected carefully" }, admin.cookie);
  const receive = (id, quantity, restockQuantity = quantity, requestKey = key()) => call("/api/admin/item-returns/" + id + "/receive", { requestKey, received: true, items: [{ lineIndex: 0, quantity, restockQuantity }], note: "Physical item quantity inspected at the return desk" }, admin.cookie);
  let guestCookie, guestUser, guestOrder;
  await t.test("Guest session uses a private cookie and never grants registered profile or admin access", async () => {
    const made = await request("/api/guest/session", { method: "POST", body: {} }); expect(made, 201); guestCookie = made.cookie; guestUser = made.data.id;
    assert.match(guestCookie, /^norda_guest=[a-f0-9]{64}$/); assert.equal(made.data.tokenHash, undefined);
    if (made.headers) { assert.match(made.headers.get("set-cookie"), /HttpOnly/i); assert.match(made.headers.get("set-cookie"), /SameSite=Lax/i); }
    assert.equal((await get("/api/auth/profile", guestCookie)).status, 401); assert.equal((await get("/api/admin/settlements", guestCookie)).status, 401);
    assert.equal((await request("/api/cart", { cookie: guestCookie, headers: { "X-Norda-Guest-ID": String(other.user._id) } })).status, 409);
  });
  await t.test("Guest cart and COD checkout preserve snapshots, one invoice and cross-browser isolation", async () => {
    const p = await product(); expect(await call("/api/cart", { productId: String(p._id), quantity: 2 }, guestCookie), 201);
    const contact = { name: "Guest customer", email: buyer.user.email }; expect(await call("/api/guest/contact", contact, guestCookie));
    const body = { paymentMethod: "cod", shippingAddress: address, checkoutKey: key() };
    const placed = expect(await call("/api/orders", body, guestCookie), 201); guestOrder = placed._id;
    assert.equal(placed.customerSnapshot.email, buyer.user.email); assert.equal(placed.customerSnapshot.isGuest, true);
    assert.equal(expect(await call("/api/orders", body, guestCookie))._id, guestOrder);
    assert.equal(await M.Invoice.countDocuments({ order: guestOrder }), 1); assert.equal((await M.Product.findById(p._id)).stock, 3);
    assert.equal(expect(await get("/api/cart", guestCookie)).items.length, 0); assert.equal((await get("/api/invoices/order/" + guestOrder, other.cookie)).status, 403);
    assert.equal(expect(await get("/api/guest/orders", guestCookie)).length, 1); assert.equal((await call("/api/guest/contact", { name: "Another name", email: other.user.email }, guestCookie)).status, 409);
  });
  await t.test("Guest cart merges once, and order linking requires both browser ownership and matching verified email", async () => {
    const p = await product(); expect(await call("/api/cart", { productId: String(p._id), quantity: 1 }, guestCookie), 201);
    const wrong = other.cookie + "; " + guestCookie; assert.equal((await call("/api/guest/claim", { confirmed: true }, wrong)).status, 403);
    const unverified = await account("user", false); const u = await M.User.findById(unverified.user._id);
    assert.equal((await call("/api/guest/claim", { confirmed: true }, unverified.cookie + "; " + guestCookie)).status, 409);
    const cookies = buyer.cookie + "; " + guestCookie;
    expect(await call("/api/guest/merge-cart", {}, cookies)); expect(await call("/api/guest/merge-cart", {}, cookies));
    assert.equal(expect(await get("/api/cart", buyer.cookie)).items.find(i => i.product._id === String(p._id)).quantity, 1);
    assert.equal((await call("/api/guest/claim", { confirmed: false }, cookies)).status, 409);
    assert.equal(expect(await call("/api/guest/claim", { confirmed: true }, cookies)).linked, 1);
    assert.equal(String((await M.Order.findById(guestOrder)).user), String(buyer.user._id)); assert.equal(String((await M.Invoice.findOne({ order: guestOrder })).user), String(buyer.user._id));
    expect(await get("/api/invoices/order/" + guestOrder, buyer.cookie)); assert.equal((await get("/api/guest/orders", guestCookie)).status, 401);
  });
  await t.test("One-use guest recovery restores only its guest history and sends no secret in API responses", async () => {
    const start = await request("/api/guest/session", { method: "POST", body: {} }), cookie = start.cookie, p = await product();
    expect(start, 201); expect(await call("/api/guest/contact", { name: "Recovery guest", email: "recover-" + key() + "@example.test" }, cookie));
    expect(await call("/api/cart", { productId: String(p._id), quantity: 1 }, cookie), 201); const o = expect(await call("/api/orders", { paymentMethod: "cod", shippingAddress: address, checkoutKey: key() }, cookie), 201);
    const mail = require("../services/mailService"), original = mail.sendAccountMail; let message;
    try { mail.sendAccountMail = async m => { message = m; return { delivery: "local" }; }; const response = expect(await call("/api/guest/recovery", { orderId: o._id, email: o.customerSnapshot.email }, undefined)); assert.equal(response.token, undefined); assert.equal(response.actionUrl, undefined); const token = new URL(message.actionUrl).hash.slice(1); const recovered = await request("/api/guest/recover", { method: "POST", body: { token } }); expect(recovered); assert.equal(expect(await get("/api/guest/orders", recovered.cookie))[0]._id, o._id); assert.equal((await request("/api/guest/recover", { method: "POST", body: { token } })).status, 400); } finally { mail.sendAccountMail = original; }
  });

  let warehouse, warehouseProduct, routedOrder, parcels;
  await t.test("Warehouse fulfillment is opt-in and makes only explicitly enabled stock saleable", async () => {
    warehouse = await M.Warehouse.create({ name: "North warehouse", code: "W-" + crypto.randomBytes(5).toString("hex"), active: true }); warehouseProduct = await product(2);
    await M.WarehouseStock.create({ warehouse: warehouse._id, product: warehouseProduct._id, variantKey: "base", quantity: 3 });
    assert.equal(expect(await get("/api/products/" + warehouseProduct._id)).stock, 2);
    const config = expect(await get("/api/admin/fulfillment/policy", admin.cookie)).policy;
    expect(await call("/api/admin/fulfillment/policy", { enabled: true, allowSplit: true, revision: config.revision, locations: [{ warehouse: "online", priority: 0 }, { warehouse: String(warehouse._id), priority: 1 }] }, admin.cookie, "PUT"));
    assert.equal(expect(await get("/api/products/" + warehouseProduct._id)).stock, 5); assert.equal(expect(await get("/api/products/" + warehouseProduct._id)).onlineStock, 2);
    assert.equal((await call("/api/admin/fulfillment/policy", { enabled: false, allowSplit: true, revision: 0, locations: [{ warehouse: "online", priority: 0 }] }, admin.cookie, "PUT")).status, 409);
  });
  await t.test("Automatic allocation splits exact quantities and parcel amounts while replay reserves once", async () => {
    const owner = await account(); expect(await call("/api/cart", { productId: String(warehouseProduct._id), quantity: 4 }, owner.cookie), 201);
    const body = { paymentMethod: "cod", shippingAddress: address, checkoutKey: key() }; routedOrder = expect(await call("/api/orders", body, owner.cookie), 201);
    assert.equal(routedOrder.fulfillmentManaged, true); assert.deepEqual(routedOrder.items[0].fulfillmentAllocations.map(a => a.quantity), [2, 2]); assert.equal(expect(await call("/api/orders", body, owner.cookie))._id, routedOrder._id);
    assert.equal((await M.Product.findById(warehouseProduct._id)).stock, 0); assert.equal((await M.WarehouseStock.findOne({ warehouse: warehouse._id, product: warehouseProduct._id })).quantity, 1); assert.equal((await M.Warehouse.findById(warehouse._id)).reservationUnits, 2);
    parcels = expect(await get("/api/orders/" + routedOrder._id + "/parcels", owner.cookie)); assert.equal(parcels.length, 2); assert.equal(parcels.reduce((n, p) => n + Math.round(p.amount * 100), 0), Math.round(routedOrder.totalAmount * 100));
    assert.equal((await get("/api/orders/" + routedOrder._id + "/parcels", other.cookie)).status, 403);
    assert.equal((await call("/api/admin/warehouses/" + warehouse._id, { active: false, note: "Attempt archive while parcels are active" }, admin.cookie, "PUT")).status, 409);
  });
  await t.test("Partial shipment blocks whole-order cancellation and COD is paid only after every parcel arrives", async () => {
    const update = (p, status, extra = {}) => call("/api/admin/fulfillment/parcels/" + p._id + "/status", { status, requestKey: key(), note: "Carrier confirmation recorded for this parcel", ...extra }, admin.cookie);
    for (const p of parcels) expect(await update(p, "processing"));
    assert.equal((await call("/api/orders/" + routedOrder._id + "/status", { isPaid: true }, admin.cookie, "PUT")).status, 409);
    expect(await update(parcels[0], "shipped", { courierName: "Fixture courier", trackingNumber: "SPLIT-A", trackingUrl: "https://track.example.test/a" }));
    assert.equal((await M.Order.findById(routedOrder._id)).status, "processing"); assert.equal((await call("/api/orders/" + routedOrder._id + "/status", { status: "cancelled", cancelReason: "Attempt cancellation after partial dispatch" }, admin.cookie, "PUT")).status, 409);
    assert.equal((await call("/api/orders/" + routedOrder._id + "/status", { status: "shipped" }, admin.cookie, "PUT")).status, 409);
    expect(await update(parcels[1], "shipped", { courierName: "Fixture courier", trackingNumber: "SPLIT-B" })); assert.equal((await M.Order.findById(routedOrder._id)).status, "shipped");
    expect(await update(parcels[0], "delivered", { confirmed: true })); assert.equal((await M.Order.findById(routedOrder._id)).isPaid, false);
    expect(await update(parcels[1], "delivered", { confirmed: true })); const order = await M.Order.findById(routedOrder._id); assert.equal(order.status, "delivered"); assert.equal(order.isPaid, true); assert.equal((await M.Invoice.findOne({ order: order._id })).paymentStatus, "paid"); assert.equal((await M.Warehouse.findById(warehouse._id)).reservationUnits, 0);
  });
  await t.test("Cancelling an unshipped allocation restores each source once and closes its reservations", async () => {
    const owner = await account(), p = await product(1); await M.WarehouseStock.create({ warehouse: warehouse._id, product: p._id, variantKey: "base", quantity: 2 });
    expect(await call("/api/cart", { productId: String(p._id), quantity: 3 }, owner.cookie), 201); const order = expect(await call("/api/orders", { shippingAddress: address, paymentMethod: "cod", checkoutKey: key() }, owner.cookie), 201);
    for (let n = 0; n < 2; n++) expect(await call("/api/orders/" + order._id + "/status", { status: "cancelled", cancelReason: "Order cancelled before parcel handover" }, admin.cookie, "PUT"));
    assert.equal((await M.Product.findById(p._id)).stock, 1); assert.equal((await M.WarehouseStock.findOne({ warehouse: warehouse._id, product: p._id })).quantity, 2); assert.equal((await M.Warehouse.findById(warehouse._id)).reservationUnits, 0); assert.equal(await M.FulfillmentParcel.countDocuments({ order: order._id, status: "cancelled" }), 2);
  });
  await t.test("Checkout write failure compensates warehouse stock, parcels, cart and reservation ledger", async () => {
    const owner = await account(), p = await product(0); await M.WarehouseStock.create({ warehouse: warehouse._id, product: p._id, variantKey: "base", quantity: 1 }); expect(await call("/api/cart", { productId: String(p._id), quantity: 1 }, owner.cookie), 201);
    const restore = fail("Invoice", "create"); try { assert.equal((await call("/api/orders", { paymentMethod: "cod", shippingAddress: address, checkoutKey: key() }, owner.cookie)).status, 500); } finally { restore(); }
    assert.equal((await M.WarehouseStock.findOne({ warehouse: warehouse._id, product: p._id })).quantity, 1); assert.equal((await M.Warehouse.findById(warehouse._id)).reservationUnits, 0); assert.equal(await M.Order.countDocuments({ user: owner.user._id }), 0); assert.equal(expect(await get("/api/cart", owner.cookie)).items.length, 1);
  });
  let higher, highCase, pickup;
  await t.test("A higher-price exchange snapshots the exact coupon-adjusted difference and guards dispatch", async () => {
    higher = await delivered(); highCase = expect(await createCase(higher), 201); assert.equal(highCase.exchangeBalance, 200); assert.equal(highCase.creditAmount, 0); expect(await decide(highCase._id));
    assert.equal((await call("/api/admin/item-returns/" + highCase._id + "/shipment", { status: "shipped", courierName: "Fixture", trackingNumber: "E-123", note: "Attempt dispatch before payment and receipt" }, admin.cookie)).status, 409);
    assert.equal((await get("/api/orders/exchanges/" + highCase._id + "/payment", other.cookie)).status, 403);
  });
  await t.test("Reverse pickup requires approved ownership and a real courier confirmation/reference", async () => {
    const body = { itemCase: highCase._id, requestKey: key(), note: "Please arrange collection from the saved order address" };
    pickup = expect(await call("/api/orders/" + higher.order._id + "/pickups", body, higher.cookie), 201); assert.equal(expect(await call("/api/orders/" + higher.order._id + "/pickups", body, higher.cookie), 201)._id, pickup._id);
    assert.equal((await call("/api/orders/" + higher.order._id + "/pickups", { ...body, requestKey: key() }, other.cookie)).status, 403);
    const booking = { status: "booked", requestKey: key(), confirmed: false, courierName: "Fixture courier", bookingReference: "PICKUP-ABC", scheduledFor: new Date(Date.now() + 3600000).toISOString(), trackingUrl: "https://tracking.example.test/pickup", note: "Courier appointment was confirmed with the customer" };
    assert.equal((await call("/api/admin/return-pickups/" + pickup._id + "/status", booking, admin.cookie)).status, 400); expect(await call("/api/admin/return-pickups/" + pickup._id + "/status", { ...booking, confirmed: true }, admin.cookie));
    for (const status of ["picked_up", "in_transit", "arrived"]) expect(await call("/api/admin/return-pickups/" + pickup._id + "/status", { status, requestKey: key(), note: "Physical return parcel progress confirmed" }, admin.cookie));
  });
  await t.test("Partial receipts restock only inspected quantities, replay once and hold replacement dispatch", async () => {
    const before = (await M.Product.findById(higher.p._id)).variants[0].stock, receiptKey = key();
    const first = expect(await receive(highCase._id, 1, 1, receiptKey)); assert.equal(first.status, "receiving"); expect(await receive(highCase._id, 1, 1, receiptKey));
    assert.equal((await M.Product.findById(higher.p._id)).variants[0].stock, before + 1); assert.equal(await M.ReturnReceipt.countDocuments({ itemCase: highCase._id }), 1); assert.equal((await M.ReturnPickup.findById(pickup._id)).status, "partially_received");
    assert.equal((await receive(highCase._id, 2)).status, 409); assert.equal((await receive(highCase._id, 1, 0, receiptKey)).status, 409);
  });
  await t.test("Actual exchange payment is amount-checked, receipt-backed and separate from the original invoice", async () => {
    const body = { requestKey: key(), amount: 199, reference: "BANK-HIGH-123", confirmed: true, note: "Verified the separate exchange bank transfer" };
    assert.equal((await call("/api/admin/exchanges/" + highCase._id + "/payment", body, admin.cookie)).status, 400);
    body.amount = 200; expect(await call("/api/admin/exchanges/" + highCase._id + "/payment", body, admin.cookie), 201); expect(await call("/api/admin/exchanges/" + highCase._id + "/payment", body, admin.cookie), 201);
    const complete = expect(await receive(highCase._id, 1, 0)); assert.equal(complete.status, "ready"); assert.equal(complete.exchangePaymentStatus, "paid"); assert.equal((await M.Invoice.findById(higher.invoice._id)).totalAmount, higher.order.totalAmount); assert.equal(await M.ExchangePayment.countDocuments({ itemCase: highCase._id }), 1); assert.equal((await M.ReturnPickup.findById(pickup._id)).status, "received");
    const ship = { status: "shipped", courierName: "Fixture", trackingNumber: "HIGH-EXCHANGE", note: "Funded replacement handed to the carrier" }; expect(await call("/api/admin/item-returns/" + highCase._id + "/shipment", ship, admin.cookie));
  });
  let lower, lowCase;
  await t.test("A cheaper replacement holds its difference refund until every returned unit arrives", async () => {
    lower = await delivered(); lowCase = expect(await createCase(lower, "exchange", 2), 201); assert.equal(lowCase.exchangeBalance, -100); assert.equal(lowCase.creditAmount, 100); expect(await decide(lowCase._id));
    assert.equal((await M.Refund.findOne({ itemCase: lowCase._id })).status, "awaiting_return"); expect(await receive(lowCase._id, 1, 0)); assert.equal(await M.CreditNote.countDocuments({ itemCase: lowCase._id }), 0); assert.equal((await M.Refund.findOne({ itemCase: lowCase._id })).status, "awaiting_return");
    const full = expect(await receive(lowCase._id, 1, 1)); assert.equal(full.status, "received"); const credit = await M.CreditNote.findById(full.creditNote); assert.equal(credit.kind, "exchange_adjustment"); assert.equal(credit.totalAmount, 100); assert.equal(credit.items.reduce((n, i) => n + i.creditAmount, 0), 100); assert.equal((await M.Refund.findById(full.refund)).status, "pending");
    expect(await call("/api/admin/operations/refunds/" + full.refund + "/confirm", { confirmed: true, reference: "REFUND-LOW-123", note: "Actual price difference was returned to the customer" }, admin.cookie));
    const ready = await M.ItemReturnCase.findById(lowCase._id); assert.equal(ready.status, "ready"); assert.equal(ready.exchangePaymentStatus, "refunded"); assert.equal((await M.CreditNote.findById(full.creditNote)).status, "settled"); assert.equal((await M.Invoice.findById(lower.invoice._id)).refundedAmount, 100); assert.equal((await M.Invoice.findById(lower.invoice._id)).totalAmount, lower.order.totalAmount);
  });
  await t.test("A different base product can replace a purchased variant with a fixed price adjustment", async () => {
    const f = await delivered({ quantity: 1, discount: 10 }), p = await product(4, 160);
    const c = expect(await call("/api/orders/" + f.order._id + "/item-returns", { type: "exchange", reason: "Please change this item to another product", requestKey: key(), items: [{ lineIndex: 0, quantity: 1, replacementProductId: String(p._id) }] }, f.cookie), 201);
    assert.equal(c.exchangeBalance, 60); expect(await decide(c._id)); assert.equal((await M.Product.findById(p._id)).stock, 3); expect(await decide(c._id, "reject")); assert.equal((await M.Product.findById(p._id)).stock, 4);
  });
  await t.test("Partial receipt write failure rolls back restock, progress, receipt record and credit", async () => {
    const f = await delivered(), c = expect(await createCase(f, "return"), 201); expect(await decide(c._id)); const before = (await M.Product.findById(f.p._id)).variants[0].stock;
    const restore = fail("ReturnReceipt", "create"); try { assert.equal((await receive(c._id, 1)).status, 500); } finally { restore(); }
    assert.equal((await M.Product.findById(f.p._id)).variants[0].stock, before); assert.equal((await M.ItemReturnCase.findById(c._id)).status, "approved"); assert.equal(await M.ReturnReceipt.countDocuments({ itemCase: c._id }), 0);
  });
  let onlineFixture, onlineCase;
  await t.test("Exchange SSLCOMMERZ callbacks validate a separate charge and cannot rewrite the original paid order", async () => {
    onlineFixture = await delivered(); onlineCase = expect(await createCase(onlineFixture), 201); expect(await decide(onlineCase._id));
    const gateway = require("../services/sslcommerzService"), original = { isConfigured: gateway.isConfigured, createPaymentSession: gateway.createPaymentSession, validatePayment: gateway.validatePayment };
    try { gateway.isConfigured = () => true; gateway.createPaymentSession = async p => { assert.equal(p.callbackKind, "exchange"); assert.equal(p.order.totalAmount, 200); return { checkoutUrl: "https://sandbox.sslcommerz.com/EasyCheckOut/exchange-fixture", sessionKey: "exchange-fixture" }; };
      expect(await call("/api/orders/exchanges/" + onlineCase._id + "/payment", { requestKey: key() }, onlineFixture.cookie), 201); const payment = await M.ExchangePayment.findOne({ itemCase: onlineCase._id });
      gateway.validatePayment = async id => ({ status: "VALID", val_id: id, tran_id: payment.transactionId, amount: "200.00", currency: "BDT", risk_level: "0", bank_tran_id: "EXCHANGE-BANK-123" });
      for (let n = 0; n < 2; n++) expect(await request("/api/exchange-payments/sslcommerz/ipn", { method: "POST", body: { tran_id: payment.transactionId, val_id: "EXCHANGE-VALID-123" }, headers: { Origin: "https://sandbox.sslcommerz.com" } }));
      assert.equal((await M.ExchangePayment.findById(payment._id)).status, "paid"); assert.equal((await M.ItemReturnCase.findById(onlineCase._id)).exchangePaymentStatus, "paid"); assert.equal((await M.Order.findById(onlineFixture.order._id)).totalAmount, onlineFixture.order.totalAmount); assert.equal(await M.Payment.countDocuments({ order: onlineFixture.order._id }), 0);
      assert.equal((await request("/api/exchange-payments/sslcommerz/fail", { method: "POST", body: { tran_id: payment.transactionId } })).status, 303); assert.equal((await M.ExchangePayment.findById(payment._id)).status, "paid");
    } finally { Object.assign(gateway, original); }
  });
  await t.test("Availability alerts are exact-option, verified-email subscriptions and send once per subscription", async () => {
    const p = await product(0), unverified = await account("user", false); assert.equal((await call("/api/stock-alerts", { productId: String(p._id) }, unverified.cookie)).status, 409);
    const watch = expect(await call("/api/stock-alerts", { productId: String(p._id) }, buyer.cookie), 201); assert.equal(expect(await call("/api/stock-alerts", { productId: String(p._id) }, buyer.cookie), 201)._id, watch._id);
    assert.equal((await request("/api/stock-alerts/" + watch._id, { method: "DELETE", cookie: other.cookie })).status, 404);
    await M.Product.updateOne({ _id: p._id }, { $set: { stock: 2 } }); const service = require("../services/stockWatchService"), mail = require("../services/mailService"), original = mail.sendAccountMail; let sent = [];
    try { mail.sendAccountMail = async message => { sent.push(message); return { delivery: "local" }; }; await service.scan(); await service.scan(); await service.deliver(); await service.deliver(); assert.equal(sent.length, 1); assert.match(sent[0].text, /does not reserve/); assert.equal((await M.StockWatch.findById(watch._id)).active, false); assert.equal((await M.StockWatchNotice.findOne({ watch: watch._id })).status, "local"); const listed = expect(await get("/api/stock-alerts")); assert.equal(listed.find(w => w._id === String(watch._id)).unsubscribeToken, undefined); } finally { mail.sendAccountMail = original; }
  });
  let statement, imported;
  await t.test("Settlement preview/import reconciles partial COD remittance, fees and exchange payments without editing orders", async () => {
    const header = require("../services/settlementService").template().trim(), stamp = new Date().toISOString();
    statement = header + "\n" + ["cod_remittance,fixture-courier,COD-" + key() + "," + routedOrder._id + ",,,200,10,190,BDT," + stamp, "exchange_sale,fixture-bank,EX-" + key() + "," + higher.order._id + "," + (await M.ExchangePayment.findOne({ itemCase: highCase._id })).transactionId + ",,200,0,200,BDT," + stamp].join("\n");
    const before = (await M.Order.findById(routedOrder._id)).toObject(); const preview = expect(await call("/api/admin/settlements/preview", { csv: statement }, admin.cookie)); assert.equal(preview.matched, 2);
    const body = { csv: statement, sourceHash: preview.sourceHash, sourceName: "Acceptance statement", requestKey: key() }; imported = expect(await call("/api/admin/settlements/import", body, admin.cookie), 201); assert.equal(expect(await call("/api/admin/settlements/import", body, admin.cookie), 201)._id, imported._id);
    assert.equal(await M.SettlementEntry.countDocuments({ batch: imported._id }), 2); assert.equal((await M.Order.findById(routedOrder._id)).isPaid, before.isPaid); assert.equal((await M.Order.findById(routedOrder._id)).totalAmount, before.totalAmount);
    const report = expect(await get("/api/admin/settlements", admin.cookie)); assert.equal(report.totals.fees, 10); assert.ok(report.outstanding.some(o => String(o.orderId) === String(routedOrder._id) && o.remaining === routedOrder.totalAmount - 200));
    assert.equal((await call("/api/admin/settlements/preview", { csv: statement }, admin.cookie)).status, 409); assert.equal((await get("/api/admin/settlements", buyer.cookie)).status, 403);
  });
  await t.test("Unpaid/mismatched statement lines stay exceptions; resolution is audited without marking them paid", async () => {
    const originalOrder = await M.Order.findById(guestOrder), header = require("../services/settlementService").template().trim(); const csv = header + "\ncod_remittance,fixture-courier,EXCEPTION-" + key() + "," + guestOrder + ",,,1,0,1,BDT," + new Date().toISOString();
    const preview = expect(await call("/api/admin/settlements/preview", { csv }, admin.cookie)); assert.equal(preview.exceptions, 1);
    const b = expect(await call("/api/admin/settlements/import", { csv, sourceHash: preview.sourceHash, sourceName: "Exception statement", requestKey: key() }, admin.cookie), 201), entry = await M.SettlementEntry.findOne({ batch: b._id });
    expect(await call("/api/admin/settlements/" + entry._id + "/resolve", { status: "excluded", note: "Statement line belongs to another account" }, admin.cookie)); assert.equal((await M.SettlementEntry.findById(entry._id)).resolutions.length, 1); assert.equal((await M.Order.findById(guestOrder)).isPaid, originalOrder.isPaid);
    assert.equal((await call("/api/admin/settlements/preview", { csv: csv.replace(",1,0,1,BDT,", ",1,0,2,BDT,") }, admin.cookie)).status, 400);
  });
  await t.test("A failed ledger insert rolls back its batch and no financial records are touched", async () => {
    const csv = require("../services/settlementService").template() + "cod_remittance,fixture-courier,ROLLBACK-" + key() + "," + routedOrder._id + ",,,10,0,10,BDT," + new Date().toISOString();
    const preview = expect(await call("/api/admin/settlements/preview", { csv }, admin.cookie)), batches = await M.SettlementBatch.countDocuments();
    const restore = fail("SettlementEntry", "create"); try { assert.equal((await call("/api/admin/settlements/import", { csv, sourceHash: preview.sourceHash, sourceName: "Failed statement", requestKey: key() }, admin.cookie)).status, 500); } finally { restore(); }
    assert.equal(await M.SettlementBatch.countDocuments(), batches); assert.equal(await M.SettlementEntry.countDocuments({ reference: { $regex: "^ROLLBACK-" } }), 0);
  });
  await t.test("Guest recovery write failure emits no cookie and retains a retryable one-use link", async () => {
    const start = expect(await request("/api/guest/session", { method: "POST", body: {} }), 201);
    const session = await request("/api/guest/session", { method: "POST", body: {} }); expect(session, 201);
    const cookie = session.cookie, p = await product(), email = "retry-" + key() + "@example.test";
    expect(await call("/api/guest/contact", { name: "Guest recovery retry", email }, cookie)); expect(await call("/api/cart", { productId: String(p._id), quantity: 1 }, cookie), 201);
    const order = expect(await call("/api/orders", { paymentMethod: "cod", shippingAddress: address, checkoutKey: key() }, cookie), 201);
    const mail = require("../services/mailService"), original = mail.sendAccountMail; let token;
    try { mail.sendAccountMail = async m => { token = new URL(m.actionUrl).hash.slice(1); return { delivery: "local" }; }; expect(await call("/api/guest/recovery", { orderId: order._id, email })); } finally { mail.sendAccountMail = original; }
    const before = await M.GuestSession.countDocuments({ user: session.data.id }), restore = fail("GuestRecovery", "findOneAndUpdate");
    try { const failed = await request("/api/guest/recover", { method: "POST", body: { token } }); assert.equal(failed.status, 500); assert.ok(!failed.cookie); } finally { restore(); }
    assert.equal(await M.GuestSession.countDocuments({ user: session.data.id }), before);
    expect(await request("/api/guest/recover", { method: "POST", body: { token } })); assert.equal((await request("/api/guest/recover", { method: "POST", body: { token } })).status, 400);
    assert.notEqual(start.id, session.data.id);
  });
  await t.test("Account linking failure restores ownership and admin invoices retain the guest contact snapshot", async () => {
    const session = await request("/api/guest/session", { method: "POST", body: {} }); expect(session, 201); const cookie = session.cookie, p = await product();
    expect(await call("/api/guest/contact", { name: "Frozen guest billing name", email: buyer.user.email }, cookie)); expect(await call("/api/cart", { productId: String(p._id), quantity: 1 }, cookie), 201);
    const order = expect(await call("/api/orders", { paymentMethod: "cod", shippingAddress: address, checkoutKey: key() }, cookie), 201);
    const invoice = expect(await get("/api/invoices/order/" + order._id, admin.cookie)); assert.equal(invoice.customerSnapshot.email, buyer.user.email); assert.equal(invoice.user.email, buyer.user.email);
    const restore = fail("Invoice", "findOneAndUpdate"); try { assert.equal((await call("/api/guest/claim", { confirmed: true }, buyer.cookie + "; " + cookie)).status, 500); } finally { restore(); }
    assert.equal(String((await M.Order.findById(order._id)).user), session.data.id); expect(await get("/api/guest/orders", cookie));
    expect(await call("/api/guest/claim", { confirmed: true }, buyer.cookie + "; " + cookie)); assert.equal((await get("/api/guest/orders", cookie)).status, 401);
    assert.equal((await M.Invoice.findOne({ order: order._id })).customerSnapshot.name, "Frozen guest billing name");
  });
  await t.test("Guest coupon limits include previous guest and registered identities sharing the order email", async () => {
    const code = "GUEST" + crypto.randomBytes(5).toString("hex").toUpperCase();
    await M.Coupon.create({ code, title: "Guest contact limit", type: "fixed", value: 10, minSubtotal: 0, maxDiscount: 0, usedCount: 0, usageLimit: 10, perUserLimit: 1, startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000), isActive: true, isPublic: true });
    const p = await product();
    for (let n = 0; n < 2; n++) {
      const session = await request("/api/guest/session", { method: "POST", body: {} }); expect(session, 201); expect(await call("/api/guest/contact", { name: "Coupon guest", email: buyer.user.email }, session.cookie)); expect(await call("/api/cart", { productId: String(p._id), quantity: 1 }, session.cookie), 201);
      if (!n) expect(await call("/api/orders", { paymentMethod: "cod", shippingAddress: address, checkoutKey: key(), couponCode: code }, session.cookie), 201);
      else assert.equal((await call("/api/coupons/preview", { code }, session.cookie)).status, 409);
    }
    await assert.rejects(require("../services/couponService").quoteCoupon(code, 100, buyer.user._id), /limit/); assert.equal((await M.Coupon.findOne({ code })).usedCount, 1);
  });
  await t.test("Two buyers racing for the last warehouse unit cannot oversell or leak reservations", async () => {
    const p = await product(0), a = await account(), b = await account(); await M.WarehouseStock.create({ warehouse: warehouse._id, product: p._id, variantKey: "base", quantity: 1 });
    for (const owner of [a, b]) expect(await call("/api/cart", { productId: String(p._id), quantity: 1 }, owner.cookie), 201);
    const placed = await Promise.all([a, b].map(owner => call("/api/orders", { paymentMethod: "cod", shippingAddress: address, checkoutKey: key() }, owner.cookie)));
    assert.deepEqual(placed.map(r => r.status).sort(), [201, 409]); assert.equal((await M.WarehouseStock.findOne({ warehouse: warehouse._id, product: p._id })).quantity, 0); assert.equal((await M.Warehouse.findById(warehouse._id)).reservationUnits, 1);
    const order = placed.find(r => r.status === 201).data; expect(await call("/api/orders/" + order._id + "/status", { status: "cancelled", cancelReason: "Race fixture cancelled before dispatch" }, admin.cookie, "PUT")); assert.equal((await M.Warehouse.findById(warehouse._id)).reservationUnits, 0);
  });
  await t.test("Disabling per-SKU splitting advertises only the largest eligible location balance", async () => {
    const service = require("../services/fulfillmentService"), current = await service.policy(), owner = await account(), p = await product(2);
    await M.WarehouseStock.create({ warehouse: warehouse._id, product: p._id, variantKey: "base", quantity: 3 });
    await service.savePolicy(admin.user, { ...current, allowSplit: false });
    try { assert.equal(expect(await get("/api/products/" + p._id)).stock, 3); assert.equal((await call("/api/cart", { productId: String(p._id), quantity: 4 }, owner.cookie)).status, 409); expect(await call("/api/cart", { productId: String(p._id), quantity: 3 }, owner.cookie), 201);
      const order = expect(await call("/api/orders", { paymentMethod: "cod", shippingAddress: address, checkoutKey: key() }, owner.cookie), 201); assert.equal(order.items[0].fulfillmentAllocations.length, 1); assert.equal(order.items[0].fulfillmentAllocations[0].warehouse, String(warehouse._id));
      expect(await call("/api/orders/" + order._id + "/status", { status: "cancelled", cancelReason: "Single-source fixture was not dispatched" }, admin.cookie, "PUT")); assert.equal((await M.Product.findById(p._id)).stock, 2);
    } finally { const latest = await service.policy(); await service.savePolicy(admin.user, { ...latest, allowSplit: true }); }
  });
  await t.test("Variant allocations preserve the exact SKU and cancellation restores its source balances", async () => {
    const f = await delivered({ quantity: 1, discount: 0 }), owner = await account(), option = f.ids[1];
    await M.Product.findOneAndUpdate({ _id: f.p._id, variants: { $elemMatch: { _id: option } } }, { $inc: { "variants.$.stock": -5 } }, { new: true });
    await M.WarehouseStock.create({ warehouse: warehouse._id, product: f.p._id, variantId: option, variantKey: String(option), quantity: 2 });
    expect(await call("/api/cart", { productId: String(f.p._id), variantId: String(option), quantity: 3 }, owner.cookie), 201);
    const order = expect(await call("/api/orders", { paymentMethod: "cod", shippingAddress: address, checkoutKey: key() }, owner.cookie), 201); assert.equal(String(order.items[0].variantId), String(option)); assert.deepEqual(order.items[0].fulfillmentAllocations.map(a => a.quantity), [1, 2]);
    expect(await call("/api/orders/" + order._id + "/status", { status: "cancelled", cancelReason: "Variant source restoration is being verified" }, admin.cookie, "PUT")); assert.equal((await M.Product.findById(f.p._id)).variants[1].stock, 1); assert.equal((await M.WarehouseStock.findOne({ warehouse: warehouse._id, product: f.p._id, variantKey: String(option) })).quantity, 2);
  });
  await t.test("Refunding an exchange charge blocks funding reuse until the real refund completes", async () => {
    const f = await delivered({ quantity: 1, discount: 0 }), c = expect(await createCase(f, "exchange", 1, 1), 201); expect(await decide(c._id));
    const payment = expect(await call("/api/admin/exchanges/" + c._id + "/payment", { requestKey: key(), amount: 100, reference: "EXCHANGE-REFUND-" + key(), confirmed: true, note: "Actual bank transfer matched to this adjustment" }, admin.cookie), 201);
    const body = { decision: "refund", requestKey: key(), note: "Customer withdrew the exchange before receipt" }; expect(await call("/api/admin/exchange-payments/" + payment._id + "/resolve", body, admin.cookie)); const fresh = await M.ExchangePayment.findById(payment._id);
    assert.equal((await M.ItemReturnCase.findById(c._id)).exchangePaymentStatus, "refund_pending"); assert.equal((await call("/api/admin/exchange-payments/" + payment._id + "/resolve", { decision: "approve", note: "Try to reuse funds reserved for refund" }, admin.cookie)).status, 409);
    assert.equal((await decide(c._id, "reject")).status, 409); expect(await call("/api/admin/operations/refunds/" + fresh.refund + "/confirm", { confirmed: true, reference: "RETURNED-" + key(), note: "Exact additional payment returned to customer" }, admin.cookie));
    assert.equal((await M.ExchangePayment.findById(payment._id)).status, "refunded"); expect(await call("/api/admin/exchange-payments/" + payment._id + "/resolve", body, admin.cookie)); expect(await decide(c._id, "reject")); assert.equal((await M.Invoice.findById(f.invoice._id)).totalAmount, f.order.totalAmount); assert.equal((await M.Order.findById(f.order._id)).refundedAmount || 0, 0);
  });
  await t.test("Unmatched amount/risk is rejected; risky and late exchange charges require explicit review", async () => {
    const gateway = require("../services/sslcommerzService"), original = { isConfigured: gateway.isConfigured, createPaymentSession: gateway.createPaymentSession, validatePayment: gateway.validatePayment };
    try { gateway.isConfigured = () => true; gateway.createPaymentSession = async () => ({ checkoutUrl: "https://sandbox.sslcommerz.com/EasyCheckOut/guard", sessionKey: "guard" });
      for (const late of [false, true]) {
        const f = await delivered({ quantity: 1, discount: 0 }), c = expect(await createCase(f, "exchange", 1, 1), 201); expect(await decide(c._id)); expect(await call("/api/orders/exchanges/" + c._id + "/payment", { requestKey: key() }, f.cookie), 201); const p = await M.ExchangePayment.findOne({ itemCase: c._id }); if (late) expect(await decide(c._id, "reject"));
        const validation = { status: "VALID", tran_id: p.transactionId, val_id: "RISK-" + key(), amount: "100.00", currency: "BDT", risk_level: late ? "0" : "1", bank_tran_id: "BANK-" + key() };
        gateway.validatePayment = async () => ({ ...validation, amount: "99.99" }); assert.equal((await call("/api/exchange-payments/sslcommerz/ipn", { tran_id: p.transactionId, val_id: validation.val_id })).status, 400);
        gateway.validatePayment = async () => ({ ...validation, risk_level: "" }); assert.equal((await call("/api/exchange-payments/sslcommerz/ipn", { tran_id: p.transactionId, val_id: validation.val_id })).status, 400);
        gateway.validatePayment = async () => ({ ...validation }); for (let n = 0; n < 2; n++) expect(await call("/api/exchange-payments/sslcommerz/ipn", { tran_id: p.transactionId, val_id: validation.val_id })); assert.equal((await M.ExchangePayment.findById(p._id)).status, "review"); assert.equal(await M.OrderEvent.countDocuments({ order: f.order._id, action: "exchange_payment_review" }), 1);
        const approval = { decision: "approve", note: "Fresh gateway details and payment risk reviewed" }; assert.equal((await call("/api/admin/exchange-payments/" + p._id + "/resolve", approval, admin.cookie)).status, 409);
        const resolved = await call("/api/admin/exchange-payments/" + p._id + "/resolve", { ...approval, acknowledgeRisk: true }, admin.cookie); assert.equal(resolved.status, late ? 409 : 200); if (late) assert.equal((await M.ItemReturnCase.findById(c._id)).status, "rejected");
      }
    } finally { Object.assign(gateway, original); }
  });
  await t.test("A late successful online attempt is reconciled before recording a second cash/bank charge", async () => {
    const gateway = require("../services/sslcommerzService"), original = { isConfigured: gateway.isConfigured, createPaymentSession: gateway.createPaymentSession, validatePayment: gateway.validatePayment, queryPayment: gateway.queryPayment };
    try { gateway.isConfigured = () => true; gateway.createPaymentSession = async () => ({ checkoutUrl: "https://sandbox.sslcommerz.com/EasyCheckOut/reconcile", sessionKey: "reconcile" }); const f = await delivered({ quantity: 1, discount: 0 }), c = expect(await createCase(f, "exchange", 1, 1), 201); expect(await decide(c._id)); expect(await call("/api/orders/exchanges/" + c._id + "/payment", { requestKey: key() }, f.cookie), 201); const p = await M.ExchangePayment.findOne({ itemCase: c._id }); await M.ExchangePayment.updateOne({ _id: p._id }, { $set: { status: "failed" } });
      gateway.queryPayment = async () => ({ APIConnect: "DONE", no_of_trans_found: 1, element: [{ tran_id: p.transactionId, val_id: "LATE-SUCCESS", status: "VALID" }] }); gateway.validatePayment = async () => ({ status: "VALID", tran_id: p.transactionId, val_id: "LATE-SUCCESS", amount: "100.00", currency: "BDT", risk_level: "0", bank_tran_id: "LATE-BANK" });
      assert.equal((await call("/api/admin/exchanges/" + c._id + "/payment", { requestKey: key(), amount: 100, reference: "SECOND-CHARGE", confirmed: true, note: "Attempt to record another charge after ambiguous failure" }, admin.cookie)).status, 409); assert.equal(await M.ExchangePayment.countDocuments({ itemCase: c._id }), 1); assert.equal((await M.ExchangePayment.findById(p._id)).status, "paid");
    } finally { Object.assign(gateway, original); }
  });
  await t.test("Alert unsubscribe and re-subscription isolate generations and concurrent scans send once", async () => {
    const f = await delivered(), service = require("../services/stockWatchService"), variant = f.ids[1]; await M.Product.findOneAndUpdate({ _id: f.p._id, variants: { $elemMatch: { _id: variant } } }, { $inc: { "variants.$.stock": -6 } });
    const w = expect(await call("/api/stock-alerts", { productId: String(f.p._id), variantId: String(variant) }), 201); await service.scan(); assert.equal(await M.StockWatchNotice.countDocuments({ watch: w._id }), 0);
    await M.Product.findOneAndUpdate({ _id: f.p._id, variants: { $elemMatch: { _id: variant } } }, { $inc: { "variants.$.stock": 2 } }); await service.scan(); const notice = await M.StockWatchNotice.findOne({ watch: w._id }).select("+unsubscribeToken"); expect(await call("/api/stock-alerts/unsubscribe", { id: w._id, token: notice.unsubscribeToken }));
    const mail = require("../services/mailService"), original = mail.sendAccountMail; let count = 0;
    try { mail.sendAccountMail = async () => { count++; return { delivery: "local" }; }; await service.deliver(); assert.equal(count, 0); await M.Product.findOneAndUpdate({ _id: f.p._id, variants: { $elemMatch: { _id: variant } } }, { $inc: { "variants.$.stock": -2 } }); expect(await call("/api/stock-alerts", { productId: String(f.p._id), variantId: String(variant) }), 201); await M.Product.findOneAndUpdate({ _id: f.p._id, variants: { $elemMatch: { _id: variant } } }, { $inc: { "variants.$.stock": 1 } }); await Promise.allSettled([service.scan(), service.scan()]); await service.deliver(); await service.deliver(); assert.equal(count, 1); assert.equal(await M.StockWatchNotice.countDocuments({ watch: w._id, generation: 2 }), 1); } finally { mail.sendAccountMail = original; }
  });
  await t.test("Refund settlements keep a negative net and CSV exports neutralize spreadsheet formulas", async () => {
    const refund = await M.Refund.findOne({ itemCase: lowCase._id }), csv = require("../services/settlementService").template() + "gateway_refund,fixture-bank,=1+1," + lower.order._id + ",," + refund._id + ",100,1,-101,BDT," + new Date().toISOString();
    const preview = expect(await call("/api/admin/settlements/preview", { csv }, admin.cookie)); assert.equal(preview.matched, 1); expect(await call("/api/admin/settlements/import", { csv, sourceHash: preview.sourceHash, sourceName: "Refund statement", requestKey: key() }, admin.cookie), 201);
    const exported = expect(await get("/api/admin/settlements/export.csv", admin.cookie)); assert.match(exported, /'\=1\+1/); const report = expect(await get("/api/admin/settlements", admin.cookie)); assert.equal(report.totals.fees, 11); assert.equal(report.totals.net, 289);
    const extra = await M.ExchangePayment.findOne({ gateway: "manual", status: "refunded" }), returned = await M.Refund.findById(extra.refund), stamp = new Date().toISOString();
    const both = require("../services/settlementService").template() + ["exchange_sale,fixture-bank,REFUNDED-CHARGE-" + key() + "," + extra.order + "," + extra.transactionId + ",,100,0,100,BDT," + stamp, "gateway_refund,fixture-bank,EXCHANGE-REFUND-" + key() + "," + extra.order + ",," + returned._id + ",100,0,-100,BDT," + stamp].join("\n");
    const pair = expect(await call("/api/admin/settlements/preview", { csv: both }, admin.cookie)); assert.equal(pair.matched, 2); expect(await call("/api/admin/settlements/import", { csv: both, sourceHash: pair.sourceHash, sourceName: "Refunded exchange statement", requestKey: key() }, admin.cookie), 201); assert.equal(expect(await get("/api/admin/settlements", admin.cookie)).totals.net, 289);

  });
  await t.test("Sales cohorts expose separate exchange receipts/refunds without rewriting original order totals", async () => {
    const day = new Date(Date.now() + 21600000).toISOString().slice(0, 10), report = expect(await get("/api/admin/reports/sales?from=" + day + "&to=" + day, admin.cookie));
    assert.ok(report.exchangeAdjustments.charged >= 400); assert.equal(report.exchangeAdjustments.confirmedRefunds, 100); assert.equal(report.netRevenueIncludingExchanges, report.summary.netRevenue + report.exchangeAdjustments.netRevenue); assert.equal(report.exchangeAdjustments.netRevenue, report.exchangeAdjustments.charged - 100);
  });
  await t.test("Warehouse reservation expiry and real payment retry keep source stock, parcel IDs and one invoice", async () => {
    const gateway = require("../services/sslcommerzService"), original = { isConfigured: gateway.isConfigured, createPaymentSession: gateway.createPaymentSession, queryPayment: gateway.queryPayment };
    try { gateway.isConfigured = () => true; gateway.createPaymentSession = async ({ transactionId }) => ({ checkoutUrl: "https://sandbox.sslcommerz.com/EasyCheckOut/" + transactionId, sessionKey: "SESSION-" + transactionId }); const owner = await account(), p = await product(1); await M.WarehouseStock.create({ warehouse: warehouse._id, product: p._id, variantKey: "base", quantity: 2 }); expect(await call("/api/cart", { productId: String(p._id), quantity: 3 }, owner.cookie), 201);
      const initiated = expect(await call("/api/payments/sslcommerz/initiate", { shippingAddress: address, checkoutKey: key() }, owner.cookie), 201), orderId = initiated.orderId, originalParcels = await M.FulfillmentParcel.find({ order: orderId }); assert.equal(originalParcels.length, 2);
      await M.Order.updateOne({ _id: orderId }, { $set: { reservationExpiresAt: new Date(Date.now() - 60000) } }); await require("../services/reservationService").expireReservationForOrder(orderId); assert.equal((await M.Warehouse.findById(warehouse._id)).reservationUnits, 0); assert.equal((await M.Product.findById(p._id)).stock, 1);
      const payment = await M.Payment.findOne({ order: orderId }); gateway.queryPayment = async input => input.sessionKey ? { APIConnect: "DONE", status: "EXPIRED", tran_id: payment.transactionId } : { APIConnect: "DONE", no_of_trans_found: 0, element: [] };
      const body = { retryKey: key() }; expect(await call("/api/payments/sslcommerz/" + orderId + "/retry", body, owner.cookie)); const rows = await M.FulfillmentParcel.find({ order: orderId }); assert.deepEqual(rows.map(p => String(p._id)).sort(), originalParcels.map(p => String(p._id)).sort()); assert.ok(rows.every(p => p.status === "pending")); assert.equal((await M.Warehouse.findById(warehouse._id)).reservationUnits, 2); assert.equal((await M.Product.findById(p._id)).stock, 0); assert.equal((await M.WarehouseStock.findOne({ warehouse: warehouse._id, product: p._id })).quantity, 0); assert.equal(await M.Invoice.countDocuments({ order: orderId }), 1);
      // Clean up the unpaid fixture using the existing cancellation workflow.
      expect(await call("/api/orders/" + orderId + "/status", { status: "cancelled", cancelReason: "Retry fixture completed before payment" }, admin.cookie, "PUT")); assert.equal((await M.Warehouse.findById(warehouse._id)).reservationUnits, 0);
    } finally { Object.assign(gateway, original); }
  });
  await t.test("Review approval after a late paid warehouse order re-reserves its original plan once", async () => {
    const gateway = require("../services/sslcommerzService"), original = { isConfigured: gateway.isConfigured, createPaymentSession: gateway.createPaymentSession, validatePayment: gateway.validatePayment, queryPayment: gateway.queryPayment };
    try { gateway.isConfigured = () => true; gateway.createPaymentSession = async () => ({ checkoutUrl: "https://sandbox.sslcommerz.com/EasyCheckOut/review-plan", sessionKey: "review-plan" }); const owner = await account(), p = await product(0); await M.WarehouseStock.create({ warehouse: warehouse._id, product: p._id, variantKey: "base", quantity: 1 }); expect(await call("/api/cart", { productId: String(p._id), quantity: 1 }, owner.cookie), 201); const initiated = expect(await call("/api/payments/sslcommerz/initiate", { shippingAddress: address, checkoutKey: key() }, owner.cookie), 201), orderId = initiated.orderId;
      await M.Order.updateOne({ _id: orderId }, { $set: { reservationExpiresAt: new Date(Date.now() - 60000) } }); await require("../services/reservationService").expireReservationForOrder(orderId); const payment = await M.Payment.findOne({ order: orderId });
      gateway.validatePayment = async () => ({ status: "VALID", val_id: "WAREHOUSE-REVIEW", tran_id: payment.transactionId, amount: String(payment.amount), currency: "BDT", risk_level: "0", bank_tran_id: "WH-BANK-" + key() }); const validation = await gateway.validatePayment(); gateway.validatePayment = async () => validation; gateway.queryPayment = async () => ({ APIConnect: "DONE", no_of_trans_found: 1, element: [{ status: "VALID", tran_id: payment.transactionId, val_id: validation.val_id }] }); expect(await call("/api/payments/sslcommerz/ipn", { status: "VALID", tran_id: payment.transactionId, val_id: validation.val_id })); assert.equal((await M.Order.findById(orderId)).paymentStatus, "review"); assert.equal((await M.Warehouse.findById(warehouse._id)).reservationUnits, 0);
      const body = { action: "approve", paymentId: String(payment._id), note: "Late gateway charge verified and warehouse stock checked" }; for (let n = 0; n < 2; n++) expect(await call("/api/admin/operations/orders/" + orderId + "/review", body, admin.cookie)); assert.equal((await M.Order.findById(orderId)).paymentStatus, "paid"); assert.equal((await M.FulfillmentParcel.findOne({ order: orderId })).status, "pending"); assert.equal((await M.Warehouse.findById(warehouse._id)).reservationUnits, 1); assert.equal((await M.WarehouseStock.findOne({ warehouse: warehouse._id, product: p._id })).quantity, 0);
    } finally { Object.assign(gateway, original); }
  });

  await t.test("Category-name search finds products safely and keeps archived inventory hidden", async () => {
    const label = "Home & Garden [" + key() + "]", category = await M.Category.create({ name: label, slug: "ux-category-" + key() });
    const p = await M.Product.create({ name: "Compact desk light", slug: "ux-light-" + key(), category: category._id, brand: "LightBox-" + key(), description: "An adjustable reading lamp", price: 100, stock: 4 });
    await M.Product.create({ name: "Archived light", slug: "ux-archive-" + key(), category: category._id, price: 100, stock: 4, isArchived: true });
    const result = expect(await request("/api/products?keyword=" + encodeURIComponent(label.toLowerCase())));
    assert.equal(result.total, 1); assert.equal(String(result.products[0]._id), String(p._id));
    assert.equal(expect(await request("/api/products?keyword=" + encodeURIComponent(p.brand))).total, 1);
  });
  await t.test("A guest sees every admin delivery stage and private tracking also works with a separate signed-in session", async () => {
    const saved = expect(await get("/api/admin/fulfillment/policy", admin.cookie)).policy;
    expect(await call("/api/admin/fulfillment/policy", { ...saved, enabled: false }, admin.cookie, "PUT"));
    try {
      const session = await request("/api/guest/session", { method: "POST", body: {} }); expect(session, 201);
      const cookie = session.cookie, p = await product(4), email = "tracked-" + key() + "@example.test";
      expect(await call("/api/guest/contact", { name: "Guest delivery customer", email }, cookie));
      expect(await call("/api/cart", { productId: String(p._id), quantity: 1 }, cookie), 201);
      const order = expect(await call("/api/orders", { shippingAddress: address, paymentMethod: "cod", checkoutKey: key() }, cookie), 201);
      const adminOrders = expect(await get("/api/orders?limit=100", admin.cookie));
      const visible = adminOrders.orders.find(o => String(o._id) === String(order._id));
      assert.equal(visible.customerSnapshot.isGuest, true); assert.equal(visible.user.email, email);
      assert.equal(expect(await get("/api/orders/" + order._id + "/tracking", cookie)).order.status, "pending");
      expect(await call("/api/orders/" + order._id + "/status", { status: "processing" }, admin.cookie, "PUT"));
      assert.equal(expect(await get("/api/orders/" + order._id + "/tracking", cookie)).order.status, "processing");
      expect(await call("/api/orders/" + order._id + "/shipment", { requestKey: key(), event: "shipped", courierName: "Acceptance courier", trackingNumber: "TRACK-" + key(), note: "Collected from the store" }, admin.cookie));
      assert.equal(expect(await get("/api/orders/" + order._id + "/tracking", cookie)).order.status, "shipped");
      assert.equal((await get("/api/orders/" + order._id + "/tracking", other.cookie + "; " + cookie)).status, 403);
      const headers = { "X-Norda-Guest": "1", "X-Norda-Guest-ID": session.data.id };
      assert.equal(expect(await request("/api/orders/" + order._id + "/tracking", { cookie: other.cookie + "; " + cookie, headers })).order.status, "shipped");
      assert.equal((await request("/api/orders/" + order._id + "/tracking", { cookie, headers: { ...headers, "X-Norda-Guest-ID": "wrong-browser-identity" } })).status, 409);
      expect(await call("/api/orders/" + order._id + "/shipment", { requestKey: key(), event: "delivered", note: "Delivery and cash collection confirmed" }, admin.cookie));
      const final = expect(await get("/api/orders/" + order._id + "/tracking", cookie)); assert.equal(final.order.status, "delivered"); assert.equal(final.order.paymentStatus, "paid");
      const history = expect(await get("/api/guest/orders", cookie)); assert.equal(history.find(o => String(o._id) === String(order._id)).status, "delivered");
      const invoice = expect(await get("/api/guest/invoices/order/" + order._id, cookie)); assert.equal(invoice.totalAmount, order.totalAmount); assert.equal(invoice.paymentStatus, "paid");
      assert.equal((await M.Product.findById(p._id)).stock, 3); assert.equal(await M.Invoice.countDocuments({ order: order._id }), 1);
    } finally { const current = expect(await get("/api/admin/fulfillment/policy", admin.cookie)).policy; expect(await call("/api/admin/fulfillment/policy", { ...saved, revision: current.revision }, admin.cookie, "PUT")); }
  });
  await t.test("Admin-only setup creates no catalog data and preserves existing accounts and passwords", async () => {
    const { ensureAdmin } = require("../scripts/ensure-admin"), beforeProducts = await M.Product.countDocuments({}), original = await M.User.findById(admin.user._id).select("+password");
    const preserved = await ensureAdmin({ email: admin.user.email, password: "Unused replacement password", name: "Do not overwrite" });
    assert.equal(preserved.created, false); assert.equal((await M.User.findById(admin.user._id).select("+password")).password, original.password);
    await assert.rejects(ensureAdmin({ email: buyer.user.email, password: "Customer must not be promoted" }), /non-admin/);
    assert.equal((await M.User.findById(buyer.user._id)).role, "user");
    await assert.rejects(ensureAdmin({ email: "not-an-email", password: "Strong enough password" }), /ADMIN_EMAIL/);
    await assert.rejects(ensureAdmin({ email: "admin-new-" + key() + "@example.test", password: "short" }), /ADMIN_PASSWORD/);
    const email = "store-admin-" + key() + "@example.test", created = await ensureAdmin({ email, password: "LocalOwnerPassword123", name: "Store operator" });
    assert.equal(created.created, true); assert.equal((await M.User.findById(created.id)).role, "admin");
    assert.equal((await ensureAdmin({ email })).id, created.id); assert.equal(await M.User.countDocuments({ email }), 1); assert.equal(await M.Product.countDocuments({}), beforeProducts);
  });
};

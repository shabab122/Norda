const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const gateway = require("../services/sslcommerzService");
const { processRefund, sweepRefunds } = require("../services/refundService");
module.exports = async (t, { request, models }) => {
  const originals = Object.fromEntries(["isConfigured", "createPaymentSession", "validatePayment", "queryPayment", "initiateRefund", "queryRefund"].map((key) => [key, gateway[key]]));
  const validations = new Map(), transactions = new Map(), remoteRefunds = new Map(); let submissions = 0;
  const cookieFor = (u) => "norda_token=" + jwt.sign({ id: u._id, version: u.tokenVersion || 0 }, process.env.JWT_SECRET);
  const admin = await models.User.create({ name: "Operations administrator", email: crypto.randomUUID() + "@example.com", password: "TestAdminPassword123", role: "admin", tokenVersion: 0 });
  const adminCookie = cookieFor(admin), base = "/api/admin/operations";
  const post = (url, body, cookie = adminCookie) => request(url, { method: "POST", body, cookie });
  const createCase = (f, type = "cancellation", key = crypto.randomUUID()) => post("/api/orders/" + f.order._id + "/requests", { type, reason: "Please review my order request", requestKey: key }, f.cookie);
  const decide = (id, decision = "approve") => post(base + "/requests/" + id + "/decision", { decision, note: "Store has reviewed the request" });
  const receive = (id, restock = true) => post(base + "/requests/" + id + "/receive", { received: true, restock, note: "All returned goods were inspected" });
  const detail = (f) => request(base + "/orders/" + f.order._id, { cookie: adminCookie });
  gateway.isConfigured = () => true;
  gateway.createPaymentSession = async ({ transactionId }) => { transactions.set(transactionId, []); return { checkoutUrl: "https://sandbox.sslcommerz.com/operations/" + transactionId, sessionKey: transactionId }; };
  gateway.validatePayment = async (id) => validations.get(id);
  gateway.queryPayment = async ({ transactionId }) => ({ APIConnect: "DONE", no_of_trans_found: (transactions.get(transactionId) || []).length, element: transactions.get(transactionId) || [] });
  gateway.initiateRefund = async (r) => { submissions++; const ref = "REF-" + r.transactionId; remoteRefunds.set(ref, { APIConnect: "DONE", bank_tran_id: r.bankTransactionId, tran_id: r.originalTransactionId, refund_ref_id: ref, status: "processing", refund_amount: r.amount, currency: "BDT" }); return { APIConnect: "DONE", bank_tran_id: r.bankTransactionId, trans_id: r.originalTransactionId, refund_ref_id: ref, status: "success" }; };
  gateway.queryRefund = async (ref) => remoteRefunds.get(ref);
  const fixture = async ({ method = "sslcommerz", paid = method !== "cod", delivered = false } = {}) => {
    const key = crypto.randomUUID(); const user = await models.User.create({ name: "Operations customer", email: key + "@example.com", password: "TestBuyerPassword123", tokenVersion: 0 }); const cookie = cookieFor(user);
    const category = await models.Category.create({ name: key, slug: key });
    const product = await models.Product.create({ name: "Operations lamp", slug: key, category: category._id, price: 1500, discountPrice: 1000, stock: 10, images: [] });
    assert.equal((await post("/api/cart", { productId: product._id, quantity: 2 }, cookie)).status, 201);
    const address = { line1: 'Road "Operations"', city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678" };
    const start = await post(method === "cod" ? "/api/orders" : method === "demo" ? "/api/payments/demo/initiate" : "/api/payments/sslcommerz/initiate", { shippingAddress: address, checkoutKey: key, ...(method === "demo" ? { channel: "mobile_banking" } : {}) }, cookie);
    assert.equal(start.status, 201); const id = start.data.orderId || start.data._id;
    let order = await models.Order.findById(id), payment;
    if (method === "sslcommerz") {
      payment = await models.Payment.findOne({ order: id }); const val = "VAL-" + payment.transactionId;
      const result = { status: "VALID", tran_id: payment.transactionId, val_id: val, bank_tran_id: "BANK-" + payment.transactionId, amount: payment.amount, currency: "BDT", risk_level: 0 };
      validations.set(val, result); transactions.set(payment.transactionId, [{ ...result, status: "VALIDATED" }]);
      if (paid) assert.equal((await post("/api/payments/sslcommerz/ipn", { status: "VALID", tran_id: payment.transactionId, val_id: val }, "")).status, 200);
    } else if (method === "demo" && paid) assert.equal((await post("/api/payments/demo/" + id + "/complete", { outcome: "success" }, cookie)).status, 200);
    if (method === "cod" && paid && !delivered) assert.equal((await request("/api/orders/" + id + "/status", { method: "PUT", cookie: adminCookie, body: { isPaid: true } })).status, 200);
    if (delivered) {
      order = await models.Order.findById(id); const steps = order.status === "pending" ? ["processing", "shipped", "delivered"] : ["shipped", "delivered"];
      for (const status of steps) assert.equal((await request("/api/orders/" + id + "/status", { method: "PUT", cookie: adminCookie, body: { status } })).status, 200);
    }
    return { user, cookie, product, order: await models.Order.findById(id), payment: method !== "cod" ? await models.Payment.findOne({ order: id }) : null, invoice: await models.Invoice.findOne({ order: id }) };
  };
  try {
    await t.test("New queues and finance actions reject guests/customers and preserve ownership", async () => {
      const f = await fixture();
      assert.equal((await request(base)).status, 401); assert.equal((await request(base, { cookie: f.cookie })).status, 403);
      const other = await models.User.create({ name: "Other customer", email: crypto.randomUUID() + "@example.com", password: "OtherPassword123", tokenVersion: 0 });
      assert.equal((await request("/api/orders/" + f.order._id + "/operations", { cookie: cookieFor(other) })).status, 403);
      assert.equal((await post(base + "/orders/" + f.order._id + "/review", { action: "approve", note: "Unauthorized approval" }, f.cookie)).status, 403);
    });
    await t.test("Unpaid cancellation request replays, blocks fulfillment, then restores stock once", async () => {
      const f = await fixture({ method: "cod" }), key = crypto.randomUUID(); const r = await createCase(f, "cancellation", key); assert.equal(r.status, 201);
      assert.equal((await createCase(f, "cancellation", key)).data._id, r.data._id);
      assert.equal((await request("/api/orders/" + f.order._id + "/status", { method: "PUT", cookie: adminCookie, body: { status: "processing" } })).status, 409);
      assert.equal((await decide(r.data._id)).status, 200); assert.equal((await decide(r.data._id)).status, 200);
      assert.equal((await models.Product.findById(f.product._id)).stock, 10); assert.equal(await models.Refund.countDocuments({ order: f.order._id }), 0);
      assert.equal((await models.Invoice.findById(f.invoice._id)).paymentStatus, "cancelled");
    });
    await t.test("Rejected cancellation retains inventory/payment and allows normal shipment", async () => {
      const f = await fixture(); const r = await createCase(f); assert.equal((await decide(r.data._id, "reject")).status, 200);
      assert.equal((await models.Product.findById(f.product._id)).stock, 8);
      assert.equal((await request("/api/orders/" + f.order._id + "/status", { method: "PUT", cookie: adminCookie, body: { status: "shipped" } })).status, 200);
      assert.equal((await createCase(f)).status, 409);
    });
    await t.test("Paid real cancellation reserves one refund and confirmation synchronizes the original invoice", async () => {
      const f = await fixture(); const originalInvoice = f.invoice.toObject(); const r = await createCase(f); const count = submissions;
      assert.equal((await decide(r.data._id)).status, 200); assert.equal((await decide(r.data._id)).status, 200);
      let refund = await models.Refund.findOne({ order: f.order._id }); assert.equal(refund.status, "pending"); assert.equal(submissions, count + 1);
      assert.equal((await models.Order.findById(f.order._id)).refundedAmount, 0);
      remoteRefunds.get(refund.refundReference).status = "refunded"; await processRefund(refund._id); await processRefund(refund._id);
      const order = await models.Order.findById(f.order._id), invoice = await models.Invoice.findById(f.invoice._id);
      assert.equal(order.refundStatus, "refunded"); assert.equal(order.cancellationStatus, "completed"); assert.equal(invoice.refundedAmount, order.totalAmount);
      assert.equal(invoice.invoiceNumber, originalInvoice.invoiceNumber); assert.equal(invoice.totalAmount, originalInvoice.totalAmount); assert.equal(invoice.items[0].unitPrice, originalInvoice.items[0].unitPrice);
      assert.equal((await models.Product.findById(f.product._id)).stock, 10); assert.equal(await models.Invoice.countDocuments({ order: order._id }), 1);
      const replay = await post("/api/payments/sslcommerz/ipn", { status: "VALID", tran_id: f.payment.transactionId, val_id: f.payment.validationId }, ""); assert.equal(replay.status, 200); assert.equal((await models.Order.findById(order._id)).refundStatus, "refunded");
    });
    await t.test("Return approval waits for receipt; receipt/restock/refund replay cannot duplicate stock", async () => {
      const f = await fixture({ delivered: true }); const r = await createCase(f, "return"); assert.equal(r.status, 201);
      assert.equal((await receive(r.data._id)).status, 409); assert.equal((await decide(r.data._id)).status, 200);
      assert.equal((await models.Product.findById(f.product._id)).stock, 8);
      assert.equal((await receive(r.data._id)).status, 200); assert.equal((await receive(r.data._id)).status, 200); assert.equal((await models.Product.findById(f.product._id)).stock, 10);
      const refund = await models.Refund.findOne({ order: f.order._id }); remoteRefunds.get(refund.refundReference).status = "refunded"; await processRefund(refund._id);
      assert.equal((await models.OrderRequest.findById(r.data._id)).status, "completed"); assert.equal((await models.Order.findById(f.order._id)).returnStatus, "completed");
    });
    await t.test("Cash refund confirmation requires admin acknowledgement and its receipt", async () => {
      const f = await fixture({ method: "cod", delivered: true }); const r = await createCase(f, "return"); await decide(r.data._id); await receive(r.data._id, false);
      const refund = await models.Refund.findOne({ order: f.order._id }); assert.equal(refund.gateway, "manual"); assert.equal(refund.status, "pending");
      assert.equal((await post(base + "/refunds/" + refund._id + "/confirm", { note: "Cash returned", reference: "RECEIPT-123" })).status, 400);
      assert.equal((await post(base + "/refunds/" + refund._id + "/confirm", { note: "Cash returned", reference: "RECEIPT-123", confirmed: true }, f.cookie)).status, 403);
      assert.equal((await post(base + "/refunds/" + refund._id + "/confirm", { note: "Cash returned", reference: "RECEIPT-123", confirmed: true })).status, 200);
      assert.equal((await models.Order.findById(f.order._id)).refundStatus, "refunded"); assert.equal((await models.Product.findById(f.product._id)).stock, 8);
    });
    await t.test("Simulated refunds transfer no money and finish the same order/request", async () => {
      const f = await fixture({ method: "demo" }); const r = await createCase(f), count = submissions; assert.equal((await decide(r.data._id)).status, 200);
      const refund = await models.Refund.findOne({ order: f.order._id }); assert.equal(refund.gateway, "demo"); assert.equal(refund.status, "succeeded"); assert.equal(submissions, count);
    });
    await t.test("Customer operation views expose progress while keeping internal audit/payment references private", async () => {
      const f = await fixture(); await post(base + "/orders/" + f.order._id + "/review", { action: "note", note: "Private fraud investigation note" });
      await models.Order.updateOne({ _id: f.order._id }, { $set: { paymentStatus: "review", paymentReviewStatus: "open" } });
      assert.equal((await post(base + "/orders/" + f.order._id + "/review", { action: "approve", note: "Private approval investigation evidence" })).status, 200);
      const customer = await request("/api/orders/" + f.order._id + "/operations", { cookie: f.cookie });
      assert.equal(customer.status, 200); assert.equal(customer.data.events, undefined); assert.equal(customer.data.payments, undefined);
      for (const path of ["/api/orders/" + f.order._id + "/operations", "/api/orders/" + f.order._id, "/api/orders/my", "/api/invoices/order/" + f.order._id]) {
        const result = await request(path, { cookie: f.cookie }); assert.equal(result.status, 200);
        const text = JSON.stringify(result.data);
        for (const privateValue of ["Private fraud investigation note", "Private approval investigation evidence", f.payment.bankTransactionId, f.payment.validationId]) assert.ok(!text.includes(privateValue), "Private operation evidence leaked from " + path);
      }
      const internal = await detail(f); assert.ok(internal.data.events.some((item) => item.note === "Private fraud investigation note")); assert.equal(internal.data.order.reviewResolutionNote, "Private approval investigation evidence"); assert.equal(internal.data.order.settledBankTransactionId, f.payment.bankTransactionId); assert.equal(internal.data.payments[0].sessionKey, undefined); assert.equal(internal.data.payments[0].checkoutUrl, undefined);
    });
    await t.test("Verified risky payment needs explicit approval and an audit note before fulfillment", async () => {
      const f = await fixture(); validations.get(f.payment.validationId).risk_level = 1;
      await models.Order.updateOne({ _id: f.order._id }, { $set: { paymentStatus: "review", paymentReviewStatus: "open" } });
      const body = { action: "approve", note: "Merchant checked risk evidence" };
      assert.equal((await post(base + "/orders/" + f.order._id + "/review", body)).status, 409);
      assert.equal((await post(base + "/orders/" + f.order._id + "/review", { ...body, acknowledgeRisk: true })).status, 200);
      assert.equal((await models.Order.findById(f.order._id)).paymentReviewStatus, "approved"); assert.equal((await models.Invoice.findById(f.invoice._id)).paymentStatus, "paid");
    });
    await t.test("Extra charge refund does not subtract the retained sale or restore inventory", async () => {
      const f = await fixture(); await models.Order.updateOne({ _id: f.order._id }, { $set: { paymentStatus: "review", paymentReviewStatus: "open" } });
      const txn = "EXTRA-" + crypto.randomBytes(8).toString("hex"), val = "V-" + txn, bank = "B-" + txn;
      const extra = await models.Payment.create({ order: f.order._id, user: f.user._id, gateway: "sslcommerz", transactionId: txn, amount: f.order.totalAmount, currency: "BDT", status: "paid", validationId: val, bankTransactionId: bank });
      const validation = { status: "VALID", tran_id: txn, val_id: val, bank_tran_id: bank, amount: extra.amount, currency: "BDT", risk_level: 0 }; validations.set(val, validation); transactions.set(txn, [{ ...validation, status: "VALIDATED" }]);
      const reviewBody = { action: "approve", note: "Both charges investigated" }; assert.equal((await post(base + "/orders/" + f.order._id + "/review", reviewBody)).status, 409);
      const start = await post(base + "/orders/" + f.order._id + "/refunds", { paymentId: extra._id, note: "Refund duplicated payment", requestKey: crypto.randomUUID() }); assert.equal(start.status, 202); assert.equal(start.data.scope, "extra_payment");
      remoteRefunds.get(start.data.refundReference).status = "refunded"; await sweepRefunds();
      assert.equal((await post(base + "/orders/" + f.order._id + "/review", reviewBody)).status, 200);
      const order = await models.Order.findById(f.order._id); assert.equal(order.refundedAmount, 0); assert.equal(order.extraRefundedAmount, extra.amount); assert.equal((await models.Product.findById(f.product._id)).stock, 8);
    });
    await t.test("Review revenue is excluded and successful order refunds reduce net sales", async () => {
      const f = await fixture(); await models.Order.updateOne({ _id: f.order._id }, { $set: { paymentStatus: "review", paymentReviewStatus: "open" } });
      const rows = await models.Order.find({}); const expected = rows.filter((row) => row.isPaid && row.paymentStatus === "paid" && row.status !== "cancelled" && row.paymentMethod !== "demo").reduce((sum, row) => sum + Math.max(0, row.totalAmount - (row.refundedAmount || 0)), 0);
      const result = await request("/api/admin/dashboard-summary", { cookie: adminCookie }); assert.equal(result.status, 200); assert.equal(result.data.totalRevenue, expected);
    });
    await t.test("Malformed requests and over-refunds are rejected without changing the original order", async () => {
      const f = await fixture(); assert.equal((await post("/api/orders/" + f.order._id + "/requests", { type: "cancellation", reason: "ok", requestKey: "short" }, f.cookie)).status, 400);
      await models.Order.updateOne({ _id: f.order._id }, { $set: { paymentStatus: "review", paymentReviewStatus: "open" } });
      assert.equal((await post(base + "/orders/" + f.order._id + "/refunds", { note: "Reject an excessive refund", amount: f.order.totalAmount + 1, requestKey: crypto.randomUUID() })).status, 409);
      assert.equal((await models.Order.findById(f.order._id)).status, "processing"); assert.equal((await models.Product.findById(f.product._id)).stock, 8); assert.equal(await models.Refund.countDocuments({ order: f.order._id }), 0);
    });
    await t.test("Concurrent cancellation approval creates one refund and restores inventory once", async () => {
      const f = await fixture(); const r = await createCase(f); const count = submissions;
      const results = await Promise.all([decide(r.data._id), decide(r.data._id)]); assert.ok(results.some((row) => row.status === 200)); assert.ok(results.every((row) => [200, 409].includes(row.status)));
      assert.equal(submissions, count + 1); assert.equal(await models.Refund.countDocuments({ order: f.order._id }), 1); assert.equal((await models.Product.findById(f.product._id)).stock, 10);
    });
  } finally { Object.assign(gateway, originals); }
};

const assert = require("node:assert/strict");
const gateway = require("../services/sslcommerzService");

// Runs unchanged against the memory fault adapter and real MongoDB HTTP app.
async function demoJourneys(t, { request, models, customerCookie, otherCookie, adminCookie, productId, address }) {
  const { Order, Payment, Product, Invoice, OperationLock } = models;
  const start = async (channel, key) => {
    await request("/api/cart", { method: "DELETE", cookie: customerCookie });
    assert.equal((await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId, quantity: 1 } })).status, 201);
    const body = { shippingAddress: address, checkoutKey: key, channel, amount: 1, isPaid: true };
    return { body, result: await request("/api/payments/demo/initiate", { method: "POST", cookie: customerCookie, body }) };
  };
  for (const channel of ["mobile_banking", "card_bank"]) {
    for (const outcome of ["success", "failure", "cancel"]) {
      await t.test("Demo " + channel + ": " + outcome + ", replay, ownership, invoice and stock", async () => {
        const stock = (await Product.findById(productId)).stock;
        const revenue = (await request("/api/admin/dashboard-summary", { cookie: adminCookie })).data.totalRevenue;
        const count = await Order.countDocuments();
        const { body, result } = await start(channel, "demo-journey-" + channel + "-" + outcome);
        assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(result.data.isDemo, true);
        const id = result.data.orderId; const path = "/api/payments/demo/" + id;
        assert.equal(result.data.channel, channel); assert.notEqual(result.data.amount, 1);
        assert.equal((await request(path)).status, 401);
        assert.equal((await request(path, { cookie: otherCookie })).status, 403);
        assert.equal((await request(path + "/complete", { method: "POST", cookie: otherCookie, body: { outcome: "success" } })).status, 403);
        assert.equal((await request(path, { cookie: customerCookie })).data.status, "initiated");
        const replay = await request("/api/payments/demo/initiate", { method: "POST", cookie: customerCookie, body });
        assert.equal(replay.data.paymentId, result.data.paymentId);
        assert.equal((await request("/api/payments/demo/initiate", { method: "POST", cookie: customerCookie, body: { ...body, channel: channel === "mobile_banking" ? "card_bank" : "mobile_banking" } })).status, 409);
        assert.equal((await request(path + "/complete", { method: "POST", cookie: customerCookie, body: { outcome: "paid", amount: 1 } })).status, 400);
        assert.equal((await request("/api/orders/" + id + "/status", { method: "PUT", cookie: adminCookie, body: { status: "processing" } })).status, 409);
        const complete = { method: "POST", cookie: customerCookie, body: { outcome, amount: 1 } };
        const simultaneous = await Promise.all([request(path + "/complete", complete), request(path + "/complete", complete)]);
        assert.ok(simultaneous.some((response) => response.status === 200));
        assert.ok(simultaneous.every((response) => [200, 409].includes(response.status)));
        const repeated = await request(path + "/complete", complete); assert.equal(repeated.status, 200); assert.equal(repeated.data.replayed, true);
        const changed = await request(path + "/complete", { ...complete, body: { outcome: outcome === "success" ? "failure" : "success" } }); assert.equal(changed.status, 409);
        const order = await Order.findById(id); const invoice = await Invoice.findOne({ order: id }); const payment = await Payment.findOne({ order: id });
        const expected = { success: "paid", failure: "failed", cancel: "cancelled" }[outcome];
        assert.equal(order.paymentMethod, "demo"); assert.equal(order.paymentChannel, channel);
        assert.equal(payment.gateway, "demo"); assert.equal(payment.channel, channel); assert.equal(payment.status, expected);
        assert.equal(order.paymentStatus, expected); assert.equal(invoice.paymentStatus, expected);
        assert.equal(order.isPaid, outcome === "success"); assert.equal(order.status, outcome === "success" ? "processing" : "cancelled");
        assert.equal(order.stockRestored, outcome !== "success");
        assert.equal((await Product.findById(productId)).stock, stock - (outcome === "success" ? 1 : 0));
        assert.equal(await Order.countDocuments(), count + 1); assert.equal(await Payment.countDocuments({ order: id }), 1); assert.equal(await Invoice.countDocuments({ order: id }), 1);
        assert.equal((await request("/api/cart", { cookie: customerCookie })).data.items.length, 0);
        assert.equal((await request("/api/invoices/order/" + id, { cookie: customerCookie })).data.order.paymentMethod, "demo");
        assert.equal((await request("/api/admin/dashboard-summary", { cookie: adminCookie })).data.totalRevenue, revenue);
        assert.match((await request("/api/admin/reports/orders.csv", { cookie: adminCookie })).data, /DEMO \/ (mobile_banking|card_bank)/);
        // Public provider callbacks must never advance or downgrade a demo record.
        const validate = gateway.validatePayment;
        try {
          gateway.validatePayment = async () => { throw new Error("Demo leaked to real gateway validation"); };
          for (const endpoint of ["success", "fail", "cancel", "ipn"]) {
            const response = await request("/api/payments/sslcommerz/" + endpoint, { method: "POST", body: { tran_id: payment.transactionId, val_id: "forged-demo", status: "VALID" } });
            assert.equal(response.status, endpoint === "ipn" ? 422 : 303);
          }
        } finally { gateway.validatePayment = validate; }
        assert.equal((await Payment.findById(payment._id)).status, expected);
        assert.equal((await Order.findById(id)).paymentStatus, expected);
        assert.equal(await OperationLock.countDocuments(), 0);
      });
    }
  }
  await t.test("Demo guards: disabled/production, malformed input and genuine orders", async () => {
    const env = { NODE_ENV: process.env.NODE_ENV, PAYMENT_DEMO_ENABLED: process.env.PAYMENT_DEMO_ENABLED };
    const before = await Order.countDocuments();
    try {
      for (const [mode, flag] of [["production", "true"], ["test", "false"]]) {
        process.env.NODE_ENV = mode; process.env.PAYMENT_DEMO_ENABLED = flag;
        assert.equal((await request("/api/payments/config")).data.demoEnabled, false);
        assert.equal((await request("/api/payments/demo/initiate", { method: "POST", cookie: customerCookie, body: { channel: "mobile_banking", shippingAddress: address } })).status, 503);
      }
    } finally { for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
    assert.equal(await Order.countDocuments(), before);
    assert.equal((await request("/api/payments/config")).data.demoEnabled, true);
    assert.equal((await request("/api/payments/demo/initiate", { method: "POST", cookie: customerCookie, body: { channel: "arbitrary", shippingAddress: address } })).status, 400);
    assert.equal((await request("/api/payments/demo/not-an-id", { cookie: customerCookie })).status, 400);
    const real = await Order.findOne({ paymentMethod: "cod" });
    if (real) assert.equal((await request("/api/payments/demo/" + real._id + "/complete", { method: "POST", cookie: customerCookie, body: { outcome: "success" } })).status, String(real.user) === String((await request("/api/auth/profile", { cookie: customerCookie })).data._id) ? 400 : 403);
  });
  await t.test("Demo completion rollback and retry preserve pending records and inventory", async () => {
    for (const outcome of ["success", "failure", "cancel"]) {
      const before = (await Product.findById(productId)).stock;
      const { result } = await start("card_bank", "demo-rollback-journey-" + outcome); assert.equal(result.status, 201);
      const id = result.data.orderId; const path = "/api/payments/demo/" + id + "/complete";
      const original = Invoice.findOneAndUpdate; let calls = 0;
      try {
        Invoice.findOneAndUpdate = function (...args) { if (++calls === (outcome === "success" ? 1 : 2)) throw new Error("Injected demo invoice write failure"); return original.apply(this, args); };
        assert.equal((await request(path, { method: "POST", cookie: customerCookie, body: { outcome } })).status, 500);
      } finally { Invoice.findOneAndUpdate = original; }
      assert.equal((await Order.findById(id)).paymentStatus, "pending"); assert.equal((await Order.findById(id)).status, "pending");
      assert.equal((await Payment.findOne({ order: id })).status, "initiated"); assert.equal((await Invoice.findOne({ order: id })).paymentStatus, "pending");
      assert.equal((await Product.findById(productId)).stock, before - 1);
      assert.equal((await request(path, { method: "POST", cookie: customerCookie, body: { outcome } })).status, 200);
    }
  });
  await t.test("Interrupted demo initialization resumes from My Orders without losing another cart", async () => {
    const before = (await Product.findById(productId)).stock;
    const original = Payment.create; let fail = true; let result;
    try {
      Payment.create = function (...args) { if (fail) { fail = false; throw new Error("Injected demo initialization failure"); } return original.apply(this, args); };
      ({ result } = await start("mobile_banking", "demo-interrupted-init-key"));
      assert.equal(result.status, 503); assert.ok(result.data.orderId);
    } finally { Payment.create = original; }
    const id = result.data.orderId;
    assert.equal(await Payment.countDocuments({ order: id }), 0);
    assert.equal((await request("/api/payments/demo/" + id, { cookie: customerCookie })).data.status, "initiated");
    assert.equal(await Payment.countDocuments({ order: id }), 0, "Reading a pending session must not create a payment");
    assert.equal((await request("/api/cart", { method: "POST", cookie: customerCookie, body: { productId, quantity: 1 } })).status, 201);
    const done = await request("/api/payments/demo/" + id + "/complete", { method: "POST", cookie: customerCookie, body: { outcome: "cancel" } });
    assert.equal(done.status, 200); assert.equal(await Payment.countDocuments({ order: id }), 1);
    assert.equal((await Product.findById(productId)).stock, before);
    assert.equal((await request("/api/cart", { cookie: customerCookie })).data.items.length, 1);
    await request("/api/cart", { method: "DELETE", cookie: customerCookie });
  });
  await t.test("An admin-cancelled demo cannot later pay or reserve stock twice", async () => {
    const before = (await Product.findById(productId)).stock;
    const { result } = await start("mobile_banking", "demo-admin-cancel-journey"); assert.equal(result.status, 201);
    const id = result.data.orderId;
    for (let i = 0; i < 2; i++) assert.equal((await request("/api/orders/" + id + "/status", { method: "PUT", cookie: adminCookie, body: { status: "cancelled" } })).status, 200);
    assert.equal((await request("/api/payments/demo/" + id + "/complete", { method: "POST", cookie: customerCookie, body: { outcome: "success" } })).status, 409);
    assert.equal((await Product.findById(productId)).stock, before);
    assert.equal((await Invoice.findOne({ order: id })).paymentStatus, "cancelled");
  });
}
module.exports = { demoJourneys };

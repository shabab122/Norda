const test = require("node:test");
const assert = require("node:assert/strict");
const gateway = require("../services/sslcommerzService");
const originalFetch = global.fetch, oldEnv = { ...process.env };
Object.assign(process.env, { SSLCOMMERZ_STORE_ID: "session-fixture-store", SSLCOMMERZ_STORE_PASSWORD: "session-fixture-password", SSLCOMMERZ_IS_LIVE: "false", SERVER_URL: "https://store.example.test", CLIENT_APP_URL: "https://store.example.test" });
test.after(() => { global.fetch = originalFetch; for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]; Object.assign(process.env, oldEnv); });
const fixture = () => ({
  order: { _id: "order-fixture", totalAmount: 2610, subtotal: 2590, discountAmount: 100, shippingFee: 120, currency: "BDT", items: [{ name: "Shirt M / Forest", quantity: 2 }, { name: "Notebook", quantity: 1 }], shippingAddress: { line1: "Fixture Road", line2: "Unit 2", city: "Dhaka", district: "Dhaka", postCode: "1207", country: "Bangladesh", phone: "01700000000" } },
  invoice: { invoiceNumber: "NORDA-FIXTURE" }, user: { _id: "user-fixture", name: "Fixture Buyer", email: "buyer@example.test" }, transactionId: "NORSESSIONFIXTURE",
});

test("Hosted-session adapter sends snapshot amount, required callback URLs and server-only credentials", async () => {
  // Protocol-only: see https://developer.sslcommerz.com/doc/v4/ . No provider
  // connection occurs; public merchant sandbox acceptance remains separate.
  let sent;
  global.fetch = async (url, options) => { sent = { url, options }; return new Response(JSON.stringify({ status: "SUCCESS", GatewayPageURL: "https://sandbox.sslcommerz.com/EasyCheckOut/fixture", sessionkey: "fixture-session" })); };
  const input = fixture(), before = JSON.stringify(input), result = await gateway.createPaymentSession(input);
  assert.equal(sent.url, "https://sandbox.sslcommerz.com/gwprocess/v4/api.php"); assert.equal(sent.options.method, "POST");
  assert.equal(sent.options.headers["Content-Type"], "application/x-www-form-urlencoded");
  const form = sent.options.body;
  assert.equal(form.get("total_amount"), "2610.00"); assert.equal(form.get("product_amount"), "2590.00"); assert.equal(form.get("currency"), "BDT"); assert.equal(form.get("tran_id"), input.transactionId);
  for (const outcome of ["success", "fail", "cancel"]) assert.equal(form.get(outcome + "_url"), "https://store.example.test/api/payments/sslcommerz/" + outcome);
  assert.equal(form.get("ipn_url"), "https://store.example.test/api/payments/sslcommerz/ipn");
  assert.equal(form.get("cus_email"), input.user.email); assert.equal(form.get("ship_add1"), input.order.shippingAddress.line1); assert.equal(form.get("value_b"), input.invoice.invoiceNumber);
  assert.equal(form.get("store_passwd"), "session-fixture-password"); assert.equal(result.sessionKey, "fixture-session"); assert.doesNotMatch(JSON.stringify(result), /session-fixture-(store|password)/); assert.equal(JSON.stringify(input), before);
});

test("Hosted-session adapter refuses malformed/failed responses and unsafe returned checkout URLs", async () => {
  for (const [body, status] of [["not-json", 200], [JSON.stringify({ status: "FAILED", failedreason: "Fixture merchant denied" }), 200], [JSON.stringify({ status: "SUCCESS", GatewayPageURL: "https://sandbox.sslcommerz.com.attacker.test/pay" }), 200], [JSON.stringify({ status: "SUCCESS", GatewayPageURL: "http://sandbox.sslcommerz.com/pay" }), 200], ["unavailable", 503]]) {
    global.fetch = async () => new Response(body, { status });
    await assert.rejects(gateway.createPaymentSession(fixture()), error => error.statusCode === 502);
  }
});

test("Live and sandbox validation use their own HTTPS endpoints and keep validation credentials out of results", async () => {
  let sent;
  global.fetch = async (url, options) => { sent = { url: new URL(url), options }; return new Response(JSON.stringify({ status: "VALID", tran_id: "NORSESSIONFIXTURE", amount: "2610.00", currency: "BDT", risk_level: "0" })); };
  for (const [mode, origin] of [["false", "https://sandbox.sslcommerz.com"], ["true", "https://securepay.sslcommerz.com"]]) {
    process.env.SSLCOMMERZ_IS_LIVE = mode;
    const result = await gateway.validatePayment("validation-fixture");
    assert.equal(sent.url.origin, origin); assert.equal(sent.url.pathname, "/validator/api/validationserverAPI.php"); assert.equal(sent.url.searchParams.get("val_id"), "validation-fixture"); assert.equal(sent.options.method, "GET");
    assert.equal(gateway.verifyPaymentForOrder(result, { transactionId: "NORSESSIONFIXTURE", amount: 2610, currency: "BDT" }).valid, true);
    assert.doesNotMatch(JSON.stringify(result), /session-fixture-password/);
  }
  process.env.SSLCOMMERZ_IS_LIVE = "false";
});

test("Missing merchant settings stop the adapter before any network request", async () => {
  let calls = 0; global.fetch = async () => { calls++; throw Error("Unexpected provider call"); };
  delete process.env.SSLCOMMERZ_STORE_PASSWORD;
  try { await assert.rejects(gateway.createPaymentSession(fixture()), error => error.statusCode === 503); assert.equal(calls, 0); }
  finally { process.env.SSLCOMMERZ_STORE_PASSWORD = "session-fixture-password"; }
});

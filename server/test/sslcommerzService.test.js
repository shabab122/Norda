const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ensureGatewayUrl,
  isHttpUrl,
  verifyPaymentForOrder,
} = require("../services/sslcommerzService");

const payment = { transactionId: "NOR-ABC123", amount: 2590, currency: "BDT" };

test("verifyPaymentForOrder accepts a fully matching low-risk validation", () => {
  const result = verifyPaymentForOrder(
    {
      status: "VALID",
      tran_id: "NOR-ABC123",
      amount: "2590.00",
      currency: "BDT",
      risk_level: "0",
    },
    payment
  );
  assert.equal(result.valid, true);
});

test("isHttpUrl permits local sandbox HTTP but requires HTTPS in live mode", () => {
  const original = process.env.SSLCOMMERZ_IS_LIVE;
  try {
    process.env.SSLCOMMERZ_IS_LIVE = "false";
    assert.equal(isHttpUrl("http://localhost:5000"), true);
    assert.equal(isHttpUrl("not-a-url"), false);
    process.env.SSLCOMMERZ_IS_LIVE = "true";
    assert.equal(isHttpUrl("http://store.example.com"), false);
    assert.equal(isHttpUrl("https://store.example.com"), true);
  } finally {
    if (original === undefined) delete process.env.SSLCOMMERZ_IS_LIVE;
    else process.env.SSLCOMMERZ_IS_LIVE = original;
  }
});

test("verifyPaymentForOrder rejects amount, transaction and risk mismatches", () => {
  assert.equal(
    verifyPaymentForOrder(
      { status: "VALID", tran_id: "OTHER", amount: "2590", currency: "BDT", risk_level: "0" },
      payment
    ).valid,
    false
  );
  assert.equal(
    verifyPaymentForOrder(
      { status: "VALID", tran_id: "NOR-ABC123", amount: "2500", currency: "BDT", risk_level: "0" },
      payment
    ).valid,
    false
  );
  assert.equal(
    verifyPaymentForOrder(
      { status: "VALID", tran_id: "NOR-ABC123", amount: "2590", currency: "BDT", risk_level: "1" },
      payment
    ).valid,
    false
  );
});

test("ensureGatewayUrl only accepts HTTPS SSLCOMMERZ hosts", () => {
  assert.equal(
    ensureGatewayUrl("https://sandbox.sslcommerz.com/gwprocess/v4/gw.php"),
    "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php"
  );
  assert.throws(() => ensureGatewayUrl("http://sandbox.sslcommerz.com/pay"), /unsafe/);
  assert.throws(() => ensureGatewayUrl("https://evilsslcommerz.com/pay"), /unsafe/);
  assert.throws(() => ensureGatewayUrl("https://sslcommerz.com.example.org/pay"), /unsafe/);
});

test("Payment validation rejects unknown or malformed gateway risk levels", () => {
  for (const risk_level of [2, "invalid"]) {
    assert.equal(verifyPaymentForOrder({ status: "VALID", tran_id: "NOR-ABC123", amount: 2590, currency: "BDT", risk_level }, payment).valid, false);
  }
});

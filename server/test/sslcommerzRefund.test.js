const test = require("node:test");
const assert = require("node:assert/strict");
const gateway = require("../services/sslcommerzService");
const names = ["SSLCOMMERZ_STORE_ID", "SSLCOMMERZ_STORE_PASSWORD", "SSLCOMMERZ_IS_LIVE", "SERVER_URL", "CLIENT_APP_URL"];
const previous = Object.fromEntries(names.map((name) => [name, process.env[name]])), originalFetch = global.fetch;
Object.assign(process.env, { SSLCOMMERZ_STORE_ID: "fixture-store", SSLCOMMERZ_STORE_PASSWORD: "fixture-password", SSLCOMMERZ_IS_LIVE: "false", SERVER_URL: "http://localhost:5000", CLIENT_APP_URL: "http://localhost:5000" });
test.after(() => { global.fetch = originalFetch; for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });
test("Refund initiation uses the bank reference, unique refund transaction ID and fixed decimal amount", async () => {
  let url; global.fetch = async (value, options) => { url = new URL(value); assert.equal(options.method, "GET"); return { ok: true, text: async () => '{"APIConnect":"DONE","status":"success"}' }; };
  await gateway.initiateRefund({ _id: "refund-record", transactionId: "NRF-UNIQUE", bankTransactionId: "BANK-ORIGINAL", amount: 12.5, reason: "Return approved" });
  assert.equal(url.origin, "https://sandbox.sslcommerz.com"); assert.equal(url.pathname, "/validator/api/merchantTransIDvalidationAPI.php"); assert.equal(url.searchParams.get("refund_trans_id"), "NRF-UNIQUE"); assert.equal(url.searchParams.get("bank_tran_id"), "BANK-ORIGINAL"); assert.equal(url.searchParams.get("refund_amount"), "12.50"); assert.equal(url.searchParams.get("refe_id"), "refund-record"); assert.equal(url.searchParams.has("tran_id"), false);
});
test("Refund status lookup uses the existing provider reference without submitting a second refund", async () => {
  let url; global.fetch = async (value) => { url = new URL(value); return { ok: true, text: async () => '{"APIConnect":"DONE","status":"processing"}' }; };
  await gateway.queryRefund("EXISTING-REF"); assert.equal(url.searchParams.get("refund_ref_id"), "EXISTING-REF"); assert.equal(url.searchParams.has("refund_trans_id"), false); assert.equal(url.searchParams.has("refund_amount"), false);
});
test("Refund network/provider errors are redacted and never claim a completed transfer", async () => {
  global.fetch = async () => { throw new Error("provider URL fixture-password"); };
  await assert.rejects(gateway.queryRefund("EXISTING-REF"), (error) => error.statusCode === 502 && !error.message.includes("fixture-password") && /reconciled/.test(error.message));
});

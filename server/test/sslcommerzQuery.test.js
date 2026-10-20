const test = require("node:test");
const assert = require("node:assert/strict");
const gateway = require("../services/sslcommerzService");
const names = ["SSLCOMMERZ_STORE_ID", "SSLCOMMERZ_STORE_PASSWORD", "SSLCOMMERZ_IS_LIVE", "SERVER_URL", "CLIENT_APP_URL"];
const prior = Object.fromEntries(names.map((name) => [name, process.env[name]])); const originalFetch = global.fetch;
process.env.SSLCOMMERZ_STORE_ID = "test-only-store"; process.env.SSLCOMMERZ_STORE_PASSWORD = "test-only-password"; process.env.SSLCOMMERZ_IS_LIVE = "false"; process.env.SERVER_URL = "http://localhost:5000"; process.env.CLIENT_APP_URL = "http://localhost:5000";
test.after(() => { global.fetch = originalFetch; for (const name of names) if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; });
test("Transaction and session lookups call the official server API with distinct query fields", async () => {
  const urls = []; global.fetch = async (url, options) => { urls.push(new URL(url)); assert.equal(options.method, "GET"); return { ok: true, text: async () => JSON.stringify({ APIConnect: "DONE", no_of_trans_found: 0, element: [] }) }; };
  await gateway.queryPayment({ transactionId: "NOR-TEST" }); await gateway.queryPayment({ sessionKey: "SESSION-TEST" });
  for (const url of urls) { assert.equal(url.origin, "https://sandbox.sslcommerz.com"); assert.equal(url.pathname, "/validator/api/merchantTransIDvalidationAPI.php"); assert.equal(url.searchParams.get("store_id"), "test-only-store"); }
  assert.equal(urls[0].searchParams.get("tran_id"), "NOR-TEST"); assert.equal(urls[0].searchParams.has("sessionkey"), false); assert.equal(urls[1].searchParams.get("sessionkey"), "SESSION-TEST"); assert.equal(urls[1].searchParams.has("tran_id"), false);
});
test("Gateway query rejects failures and malformed responses without exposing provider details", async () => {
  for (const result of [{ ok: false, text: async () => "error" }, { ok: true, text: async () => "not-json" }, { ok: true, text: async () => '{"APIConnect":"INVALID_REQUEST"}' }]) {
    global.fetch = async () => result; await assert.rejects(gateway.queryPayment({ transactionId: "NOR-TEST" }), (error) => error.statusCode === 502 && !error.message.includes("test-only-password"));
  }
  global.fetch = async () => { throw new Error("Network URL contained test-only-password"); }; await assert.rejects(gateway.queryPayment({ transactionId: "NOR-TEST" }), (error) => error.statusCode === 502 && !error.message.includes("test-only-password"));
});

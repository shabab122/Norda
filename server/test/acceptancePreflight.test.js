const test = require("node:test");
const assert = require("node:assert/strict");
const { describeConfig, isPublicHttps } = require("../scripts/acceptance-preflight");
test("Preflight reports the actual MongoDB port without disclosing database or gateway credentials", () => {
  const env = { MONGO_URI: "mongodb://private-user:private-password@127.0.0.1:27018/norda_db", JWT_SECRET: "private-secret".repeat(4), SSLCOMMERZ_STORE_ID: "private-store", SSLCOMMERZ_STORE_PASSWORD: "private-gateway-password", SERVER_URL: "https://store.example", CLIENT_APP_URL: "https://store.example", PORT: "5000" };
  const before = JSON.stringify(env); const result = describeConfig(env);
  assert.equal(result.databaseAddress, "127.0.0.1:27018/norda_db"); assert.equal(result.secretConfigured, true); assert.equal(result.gatewayCredentialsPresent, true); assert.equal(result.publicCallbackFormat, true);
  assert.doesNotMatch(JSON.stringify(result), /private-/); assert.equal(JSON.stringify(env), before);
  assert.equal(describeConfig({ ...env, PORT: "3000" }).portAllowed, false); assert.equal(describeConfig({ ...env, PORT: "3002" }).portAllowed, false);
});
test("Gateway preflight distinguishes local callback URLs and live mode from sandbox readiness", () => {
  for (const url of ["http://store.example", "https://localhost:5000", "https://127.0.0.1", "https://10.0.0.1", "https://172.20.0.1", "https://192.168.1.2", "https://[::1]", "https://user:pass@store.example", "https://store.example?secret=value"]) assert.equal(isPublicHttps(url), false, url);
  assert.equal(isPublicHttps("https://norda.example"), true); assert.equal(describeConfig({ SSLCOMMERZ_IS_LIVE: "true" }).sandboxMode, false);
});

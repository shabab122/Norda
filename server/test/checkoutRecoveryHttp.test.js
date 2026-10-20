const test = require("node:test");
const crypto = require("node:crypto");
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
process.env.NODE_ENV = "test";
const { installMemoryStore } = require("../test-support/memoryStore");
const store = installMemoryStore();
const app = require("../app");
test("HTTP checkout recovery with isolated model adapter", async (t) => {
  const listener = app.listen(0, "127.0.0.1"); await new Promise((resolve) => listener.once("listening", resolve));
  const base = "http://127.0.0.1:" + listener.address().port;
  const request = async (url, { method = "GET", cookie, body } = {}) => {
    const response = await fetch(base + url, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text() };
  };
  try { await require("../test-support/checkoutRecoveryJourneys")(t, { request, models: store.models }); }
  finally { listener.closeAllConnections(); await new Promise((resolve) => listener.close(resolve)); store.restore(); }
});

const test = require("node:test");
const crypto = require("node:crypto");
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex"); process.env.NODE_ENV = "test";
const { installMemoryStore } = require("../test-support/memoryStore");
const store = installMemoryStore(); const app = require("../app");
test("HTTP customer requests, admin review and refund operations", async (t) => {
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve)); const base = "http://127.0.0.1:" + server.address().port;
  const request = async (url, { method = "GET", cookie, body } = {}) => {
    const result = await fetch(base + url, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: result.status, data: result.headers.get("content-type")?.includes("json") ? await result.json() : await result.text() };
  };
  try { await require("../test-support/orderOperationsJourneys")(t, { request, models: store.models }); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); store.restore(); }
});

const test = require("node:test");
const crypto = require("node:crypto");
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex"); process.env.NODE_ENV = "test";
const store = require("../test-support/memoryStore").installMemoryStore();
const app = require("../app");
test("HTTP coupons, wishlist, inventory tools and store settings", async (t) => {
  const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r)); const base = "http://127.0.0.1:" + server.address().port;
  const request = async (path, { method = "GET", cookie, body } = {}) => { const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text() }; };
  try { await require("../test-support/commerceToolsJourneys")(t, { request, models: store.models }); }
  finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); store.restore(); }
});

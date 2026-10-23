const test = require("node:test"), crypto = require("node:crypto");
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex"); process.env.MAIL_TRANSPORT = "file";
const store = require("../test-support/memoryStore").installMemoryStore();
test("HTTP commerce expansion: settlement, exchanges/receipts/pickups, guests, warehouse parcels and availability alerts", { timeout: 90000 }, async t => {
  const server = require("../app").listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r)); const base = "http://127.0.0.1:" + server.address().port;
  const request = async (url, { method = "GET", body, cookie, headers = {} } = {}) => { const res = await fetch(base + url, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: res.status, data: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text(), cookie: res.headers.get("set-cookie")?.split(";")[0], headers: res.headers }; };
  try { await require("../test-support/commerceExpansionJourneys")(t, { request, models: store.models, fail: (name, method) => { store.fail(name, method); return () => {}; } }); } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); store.restore(); }
});

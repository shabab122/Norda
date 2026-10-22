const test = require("node:test");
const crypto = require("node:crypto");
const { installMemoryStore } = require("../test-support/memoryStore");
test("HTTP management: reports, staff permissions, devices, notification outcomes and item returns", { timeout: 90000 }, async (t) => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex"); process.env.NODE_ENV = "test"; process.env.MAIL_TRANSPORT = "file";
  const store = installMemoryStore(), server = require("../app").listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = async (path, { method = "GET", cookie, body, headers = {} } = {}) => { const res = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0], data: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text() }; };
  try { await require("../test-support/managementJourneys")(t, { request, models: store.models }); }
  finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); store.restore(); }
});

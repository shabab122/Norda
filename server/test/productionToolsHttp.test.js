const test = require("node:test");
const crypto = require("node:crypto");
const { installMemoryStore } = require("../test-support/memoryStore");
test("HTTP production tools: carrier, SEO, cloud images, maintenance and monitoring", { timeout: 120000 }, async (t) => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex"); process.env.NODE_ENV = "test";
  const store = installMemoryStore(), server = require("../app").listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r)); const base = "http://127.0.0.1:" + server.address().port;
  const request = async (url, { method = "GET", cookie, body, isForm = false, redirect = "follow" } = {}) => { const res = await fetch(base + url, { method, redirect, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(!isForm && body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) }); return { status: res.status, data: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text(), location: res.headers.get("location"), robots: res.headers.get("x-robots-tag"), retryAfter: res.headers.get("retry-after") }; };
  try { await require("../test-support/productionToolsJourneys")(t, { request, models: store.models }); }
  finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); store.restore(); }
});

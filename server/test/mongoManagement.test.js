const test = require("node:test");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const uri = process.env.NORDA_TEST_MONGO_URI;
test("Real MongoDB HTTP: reports, staff permissions, devices, notification outcomes and item returns", { skip: !uri, timeout: 180000 }, async (t) => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex"); process.env.NODE_ENV = "test"; process.env.MAIL_TRANSPORT = "file";
  const dbName = "norda_test_" + crypto.randomBytes(8).toString("hex");
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const server = require("../app").listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = async (path, { method = "GET", cookie, body, headers = {} } = {}) => { const res = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0], data: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text() }; };
  try { await Promise.all(Object.values(mongoose.models).map((Model) => Model.init())); await require("../test-support/managementJourneys")(t, { request, models: mongoose.models }); }
  finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});

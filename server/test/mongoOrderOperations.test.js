const test = require("node:test");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const uri = process.env.NORDA_TEST_MONGO_URI;
test("Real MongoDB HTTP: cancellation, return receipt, review, refund ledger and net revenue", { skip: !uri, timeout: 90000 }, async (t) => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex"); process.env.NODE_ENV = "test";
  const dbName = "norda_test_" + crypto.randomBytes(8).toString("hex"); await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const app = require("../app"); const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve)); const base = "http://127.0.0.1:" + server.address().port;
  const request = async (url, { method = "GET", cookie, body } = {}) => {
    const result = await fetch(base + url, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: result.status, data: result.headers.get("content-type")?.includes("json") ? await result.json() : await result.text() };
  };
  try { await Promise.all(Object.values(mongoose.models).map((Model) => Model.init())); await require("../test-support/orderOperationsJourneys")(t, { request, models: mongoose.models }); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});

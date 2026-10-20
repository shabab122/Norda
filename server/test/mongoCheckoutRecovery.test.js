const test = require("node:test");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const uri = process.env.NORDA_TEST_MONGO_URI;
test("Real MongoDB HTTP: expiry, same-order retry, reconciliation, callbacks and inventory", { skip: !uri, timeout: 90000 }, async (t) => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex"); process.env.NODE_ENV = "test";
  const dbName = "norda_test_" + crypto.randomBytes(8).toString("hex");
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const app = require("../app");
  const listener = app.listen(0, "127.0.0.1"); await new Promise((resolve) => listener.once("listening", resolve));
  const base = "http://127.0.0.1:" + listener.address().port;
  const request = async (url, { method = "GET", cookie, body } = {}) => {
    const response = await fetch(base + url, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text() };
  };
  try {
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    await require("../test-support/checkoutRecoveryJourneys")(t, { request, models: mongoose.models });
  } finally {
    listener.closeAllConnections(); await new Promise((resolve) => listener.close(resolve));
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const test = require("node:test");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const uri = process.env.NORDA_TEST_MONGO_URI;
test("Real MongoDB HTTP: courier tracking, order email outbox and variant inventory", { skip: !uri, timeout: 90000 }, async (t) => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex"); process.env.NODE_ENV = "test";
  const dbName = "norda_test_" + crypto.randomBytes(8).toString("hex"); await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const app = require("../app"); const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve)); const base = "http://127.0.0.1:" + server.address().port;
  const request = async (url, { method = "GET", cookie, body } = {}) => {
    const result = await fetch(base + url, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: result.status, data: result.headers.get("content-type")?.includes("json") ? await result.json() : await result.text() };
  };
  try { await Promise.all(Object.values(mongoose.models).map((Model) => Model.init()));
    await t.test("Native unique SKU index rejects concurrent duplicate products", async () => {
      const key = crypto.randomBytes(6).toString("hex"), category = await mongoose.models.Category.create({ name: "SKU index " + key, slug: "sku-" + key });
      const payload = { name: "Unique option " + key, category: category._id, price: 1000, stock: 1, variants: [{ sku: "INDEX-" + key.toUpperCase(), size: "M", price: 1000, stock: 1 }] };
      const result = await Promise.allSettled([mongoose.models.Product.create({ ...payload, slug: key + "-one" }), mongoose.models.Product.create({ ...payload, slug: key + "-two" })]);
      require("node:assert/strict").equal(result.filter((r) => r.status === "fulfilled").length, 1);
      require("node:assert/strict").equal(result.find((r) => r.status === "rejected").reason.code, 11000);
    });
    await require("../test-support/fulfillmentVariantsJourneys")(t, { request, models: mongoose.models }); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});

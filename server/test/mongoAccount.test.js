const test = require("node:test");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const uri = process.env.NORDA_TEST_MONGO_URI;

test("Real MongoDB HTTP: account recovery, verification, address migration, concurrency and checkout snapshots", { skip: !uri, timeout: 90000 }, async (t) => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.NODE_ENV = "test";
  process.env.CLIENT_APP_URL = "https://norda-test.example";
  process.env.MAIL_TRANSPORT = "file";
  const dbName = "norda_test_" + crypto.randomBytes(8).toString("hex");
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const app = require("../app");
  const mail = require("../services/mailService");
  const original = mail.sendAccountMail;
  const messages = [];
  mail.sendAccountMail = async (message) => { messages.push(message); return { delivery: "local" }; };
  const listener = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => listener.once("listening", resolve));
  const base = "http://127.0.0.1:" + listener.address().port;
  const request = async (url, { method = "GET", body, cookie } = {}) => {
    const response = await fetch(base + url, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text();
    return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  };
  try {
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    await require("../test-support/accountJourneys")(t, { request, models: mongoose.models, messages });
  } finally {
    listener.closeAllConnections(); await new Promise((resolve) => listener.close(resolve));
    mail.sendAccountMail = original;
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

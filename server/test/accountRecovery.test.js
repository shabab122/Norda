const test = require("node:test");
const crypto = require("node:crypto");
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
process.env.NODE_ENV = "test";
process.env.CLIENT_APP_URL = "https://norda-test.example";
process.env.MAIL_TRANSPORT = "file";
const { installMemoryStore } = require("../test-support/memoryStore");
const store = installMemoryStore();
const mail = require("../services/mailService");
const original = mail.sendAccountMail;
const app = require("../app");
const journeys = require("../test-support/accountJourneys");

test("Account recovery, verification and address-book HTTP journeys", async (t) => {
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
  try { await journeys(t, { request, models: store.models, messages }); }
  finally { listener.closeAllConnections(); await new Promise((resolve) => listener.close(resolve)); mail.sendAccountMail = original; store.restore(); }
});

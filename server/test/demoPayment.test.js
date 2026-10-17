const test = require("node:test");
const crypto = require("node:crypto");
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
process.env.NODE_ENV = "test";
delete process.env.PAYMENT_DEMO_ENABLED;
const { installMemoryStore } = require("../test-support/memoryStore");
const store = installMemoryStore();
const app = require("../app");
const { demoJourneys } = require("../test-support/demoJourneys");

test("Demo gateway HTTP journeys, with no merchant credentials or provider requests", async (t) => {
  const listener = app.listen(0, "127.0.0.1"); await new Promise((resolve) => listener.once("listening", resolve));
  const base = "http://127.0.0.1:" + listener.address().port;
  const request = async (path, { method = "GET", cookie, body } = {}) => {
    const response = await fetch(base + path, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  };
  try {
    const jwt = require("jsonwebtoken");
    const cookies = [];
    for (const [name, role] of [["Customer", "user"], ["Other", "user"], ["Admin", "admin"]]) {
      const account = await store.models.User.create({ name, email: name.toLowerCase() + "@demo.example", password: "DemoTestPassword123", role });
      cookies.push("norda_token=" + jwt.sign({ id: account._id, version: 0 }, process.env.JWT_SECRET));
    }
    const product = await store.models.Product.create({ name: "Demo headphones", price: 1290, stock: 100, images: ["/assets/products/photos/headphones.webp"] });
    await demoJourneys(t, { request, models: store.models, customerCookie: cookies[0], otherCookie: cookies[1], adminCookie: cookies[2], productId: product._id, address: { line1: "Demo Road", city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678" } });
  } finally { store.restore(); listener.close(); listener.closeAllConnections(); }
});

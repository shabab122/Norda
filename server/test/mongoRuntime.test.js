const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const mongoose = require("mongoose");
const uri = process.env.NORDA_TEST_MONGO_URI;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test("Real server starts all workers, retains a cart across graceful restart and checks deployment topology", { skip: !uri, timeout: 60000 }, async () => {
  const dbName = "norda_test_runtime_" + crypto.randomBytes(8).toString("hex");
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const root = path.resolve(__dirname, ".."), target = new URL(uri);
  target.pathname = "/" + dbName;
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = "http://127.0.0.1:" + port;
  const env = { ...process.env, MONGO_URI: target.toString(), PORT: String(port), NODE_ENV: "development", JWT_SECRET: crypto.randomBytes(32).toString("hex"), CLIENT_URL: base, CLIENT_APP_URL: base, SERVER_URL: base, SITE_URL: base, AUTH_RETURN_TOKEN: "false", MAIL_TRANSPORT: "file", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", SSLCOMMERZ_STORE_ID: "", SSLCOMMERZ_STORE_PASSWORD: "", OPERATIONS_CONNECTOR_URL: "", OPERATIONS_CONNECTOR_TOKEN: "", PARCEL_COURIER_AUTO_ENABLED: "false", REVERSE_PICKUP_AUTO_ENABLED: "false", LOGISTICS_AUTO_AFTER: "", COURIER_PROVIDER: "none", COURIER_AUTO_BOOK_ENABLED: "false", OFFSITE_BACKUP_ENABLED: "false", BACKUP_INTERVAL_HOURS: "0", OPS_ALERT_EMAIL: "", OPS_ALERT_WEBHOOK_URL: "", MEDIA_STORAGE: "local", CLOUDINARY_CLOUD_NAME: "", CLOUDINARY_API_KEY: "", CLOUDINARY_API_SECRET: "" };
  let child, output = "";
  const exit = process => new Promise(resolve => process.exitCode !== null ? resolve(process.exitCode) : process.once("exit", resolve));
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    const stopped = await Promise.race([exit(child).then(code => ({ code })), pause(8000).then(() => null)]);
    if (!stopped) { child.kill("SIGKILL"); await exit(child); throw Error("Graceful shutdown timed out"); }
    assert.equal(stopped.code, 0, output);
  };
  const start = async () => {
    output = "";
    child = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output = (output + chunk).slice(-24000); });
    for (let i = 0; i < 100; i++) {
      assert.equal(child.exitCode, null, output);
      try { const response = await fetch(base + "/api/health/ready", { signal: AbortSignal.timeout(500) }); if (response.ok && (await response.json()).status === "ready") return; } catch { /* The child is starting. */ }
      await pause(100);
    }
    throw Error("Runtime readiness did not pass: " + output);
  };
  try {
    const User = require("../models/User"), Product = require("../models/Product"), Category = require("../models/Category");
    const user = await User.create({ name: "Runtime acceptance", email: "runtime@example.test", password: "RuntimeAcceptance123" });
    const category = await Category.create({ name: "Runtime", slug: "runtime-acceptance" });
    const product = await Product.create({ name: "Runtime item", slug: "runtime-item", category: category._id, stock: 3, price: 100 });
    await start();
    const page = await fetch(base + "/checkout.html"); assert.equal(page.status, 200); assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
    const login = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: "RuntimeAcceptance123" }) });
    assert.equal(login.status, 200); const cookie = login.headers.get("set-cookie").split(";")[0]; await login.json();
    const added = await fetch(base + "/api/cart", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ productId: String(product._id), quantity: 2 }) }); assert.equal(added.status, 201); await added.json();
    await stop();
    await assert.rejects(fetch(base + "/api/health", { signal: AbortSignal.timeout(500) }));
    await start();
    const cartResponse = await fetch(base + "/api/cart", { headers: { Cookie: cookie } }), cart = await cartResponse.json();
    assert.equal(cartResponse.status, 200); assert.equal(cart.items.length, 1); assert.equal(cart.items[0].quantity, 2); assert.equal(cart.items[0].product._id, String(product._id));
    assert.equal((await Product.findById(product._id)).stock, 3);
    const preflight = spawn(process.execPath, [path.resolve(root, "../ops/deploy-preflight.js"), "production"], { env: { ...env, NODE_ENV: "production", PORT: "5000", CLIENT_URL: "https://shop.example.test", CLIENT_APP_URL: "https://shop.example.test", SERVER_URL: "https://shop.example.test", SITE_URL: "https://shop.example.test" }, stdio: ["ignore", "pipe", "pipe"] });
    let report = ""; preflight.stdout.on("data", b => report += b); preflight.stderr.on("data", b => report += b);
    const code = await exit(preflight), hello = await mongoose.connection.db.admin().command({ hello: 1 });
    const transactions = Boolean(hello.setName || hello.msg === "isdbgrid");
    assert.equal(code, transactions ? 0 : 1, report);
    if (transactions) assert.equal(JSON.parse(report).transactionReady, true);
    assert.doesNotMatch(report, new RegExp(env.JWT_SECRET));
    assert.equal(await User.countDocuments(), 1); assert.equal(await Product.countDocuments(), 1);
  } finally {
    await stop();
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

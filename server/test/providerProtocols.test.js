const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
test("eCourier REST adapter uses documented hosts/headers, assigned charges and trusted PDF labels", async () => {
  const names = ["COURIER_PROVIDER", "ECOURIER_MODE", "ECOURIER_API_KEY", "ECOURIER_API_SECRET", "ECOURIER_USER_ID"], old = Object.fromEntries(names.map((n) => [n, process.env[n]])), originalFetch = global.fetch;
  Object.assign(process.env, { COURIER_PROVIDER: "ecourier", ECOURIER_MODE: "sandbox", ECOURIER_API_KEY: "test_key", ECOURIER_API_SECRET: "test_secret", ECOURIER_USER_ID: "test_user" }); const adapter = require("../services/ecourierService"); let url, options, result;
  global.fetch = async (u, o) => { url = String(u); options = o; return new Response(JSON.stringify(result), { status: 200 }); };
  try {
    result = [{ package_code: "#100", package_name: "Everyday", shipping_charge: "80.50", weight: "1kg", coverage: "Dhaka" }]; const rows = await adapter.packages(); assert.equal(rows[0].shippingCharge, 80.5); assert.equal(url, "https://staging.ecourier.com.bd/api/packages"); assert.equal(options.headers["API-SECRET"], "test_secret"); assert.equal(options.redirect, "error");
    result = { response_code: 200, ID: "ECR12345678901" }; await adapter.book({ product_id: "NOR123" }); assert.equal(JSON.parse(options.body).product_id, "NOR123"); assert.ok(url.endsWith("/order-place"));
    result = { success: true, response_code: 200, query_data: "https://staging.ecourier.com.bd/invoices/slip.pdf" }; assert.match(await adapter.label("ECR12345678901"), /slip.pdf$/);
    for (const bad of ["javascript:alert(1)", "https://evil.example/invoices/slip.pdf", "https://staging.ecourier.com.bd@evil.example/invoices/slip.pdf", "http://staging.ecourier.com.bd/invoices/slip.pdf"]) { result.query_data = bad; await assert.rejects(adapter.label("ECR12345678901"), /label URL/); }
    result = { response_code: 400, errors: ["Duplicate product id"] }; await assert.rejects(adapter.book({}), (e) => e.uncertain === true);
    process.env.ECOURIER_MODE = "invalid"; await assert.rejects(adapter.packages(), /Configure/);
  } finally { global.fetch = originalFetch; for (const n of names) old[n] === undefined ? delete process.env[n] : process.env[n] = old[n]; }
});
test("Cloudinary REST adapter authenticates on the server and checks owned upload/resource identities", async () => {
  const names = ["MEDIA_STORAGE", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"], old = Object.fromEntries(names.map((n) => [n, process.env[n]])), originalFetch = global.fetch;
  Object.assign(process.env, { MEDIA_STORAGE: "cloudinary", CLOUDINARY_CLOUD_NAME: "norda-test", CLOUDINARY_API_KEY: "test_key", CLOUDINARY_API_SECRET: "test_secret_safe" }); const adapter = require("../services/cloudinaryService"), root = await fs.mkdtemp(path.join(os.tmpdir(), "norda-cloud-test-")), file = path.join(root, "photo.png"), id = "norda/uploads/" + crypto.randomUUID(); await fs.writeFile(file, Buffer.from("png-bytes")); let url, options;
  let result = { public_id: id, asset_id: "test_asset", secure_url: "https://res.cloudinary.com/norda-test/image/upload/v1/" + id + ".png", bytes: 9, format: "png", version: 1 };
  global.fetch = async (u, o) => { url = String(u); options = o; return new Response(JSON.stringify(result), { status: 200 }); };
  try { const meta = await adapter.upload({ path: file, mimetype: "image/png", filename: "photo.png" }, id); assert.equal(meta.cloudPublicId, id); assert.equal(url, "https://api.cloudinary.com/v1_1/norda-test/image/upload"); assert.match(options.headers.Authorization, /^Basic /); assert.equal(options.body.get("overwrite"), "false"); assert.equal(options.body.get("public_id"), id); assert.equal(options.body.get("file").type, "image/png");
    await adapter.inspect(meta); assert.equal(options.method, "GET"); assert.ok(url.includes(encodeURIComponent(id))); result = { result: "ok" }; await adapter.destroy(meta); assert.ok(url.endsWith("/image/destroy")); assert.equal(options.body.get("invalidate"), "true");
    await assert.rejects(adapter.destroy({ ...meta, cloudPublicId: "someone-elses/photo" }), /application-owned/); result = { public_id: "wrong", asset_id: "bad", secure_url: "https://evil.example/image.png", bytes: 9, format: "png" }; await assert.rejects(adapter.upload({ path: file, mimetype: "image/png", filename: "photo.png" }, id), /identity/);
  } finally { global.fetch = originalFetch; for (const n of names) old[n] === undefined ? delete process.env[n] : process.env[n] = old[n]; await fs.rm(root, { recursive: true, force: true }); }
});

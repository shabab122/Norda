const assert = require("node:assert/strict");
const { tokenHash } = require("../services/accountRecoveryService");

module.exports = async function accountJourneys(t, { request, models, messages }) {
  const { User, Category, Product } = models;
  const home = { label: "Home", line1: 'House "Rose", Road 1', line2: "Floor 2", city: "Dhaka", district: "Dhaka", postCode: "1207", country: "Bangladesh", phone: "+8801712345678" };
  const office = { ...home, label: "Office", line1: "Office Road 9", postCode: "1212" };
  const email = "account-journey@norda-test.example";
  const password = "OriginalAccount123";
  const nextPassword = "RecoveredAccount123";
  const latest = (kind, recipient = email) => messages.filter((mail) => mail.kind === kind && mail.to === recipient).at(-1);
  const secret = (mail) => new URLSearchParams(new URL(mail.actionUrl).hash.slice(1)).get("token");
  let owner, cookie, otherCookie, defaultId, officeId, product, snapshot;
  const post = (url, body, token = cookie) => request(url, { method: "POST", body, cookie: token });
  const put = (url, body, token = cookie) => request(url, { method: "PUT", body, cookie: token });
  const ageResetRequest = () => User.updateOne({ _id: owner }, { $set: { passwordResetRequestedAt: new Date(Date.now() - 61000) } });

  await t.test("New accounts receive a verification link and expose no recovery secrets or privileged fields", async () => {
    const registered = await post("/api/auth/register", { name: "Account customer", email, password, role: "admin", emailVerifiedAt: new Date(), addresses: [home] }, null);
    assert.equal(registered.status, 201); assert.equal(registered.data.emailVerified, false); assert.equal(registered.data.role, "user"); assert.deepEqual(registered.data.addresses, []);
    cookie = registered.cookie; owner = registered.data._id;
    assert.ok(latest("verify")); assert.equal(secret(latest("verify")).length, 64);
    const other = await post("/api/auth/register", { name: "Other account", email: "other-account@norda-test.example", password }, null);
    assert.equal(other.status, 201); otherCookie = other.cookie;
    const profile = await request("/api/auth/profile", { cookie });
    assert.doesNotMatch(JSON.stringify(profile.data), /password|Hash|ExpiresAt|RequestedAt|tokenVersion/);
    const stored = await User.findById(owner).select("+emailVerificationHash");
    assert.equal(stored.emailVerificationHash, tokenHash(secret(latest("verify"))));
    assert.notEqual(stored.emailVerificationHash, secret(latest("verify")));
  });
  await t.test("Verification needs explicit confirmation, is purpose-bound and is consumed once", async () => {
    const token = secret(latest("verify"));
    assert.equal((await request("/verify-email.html")).status, 200);
    assert.equal((await request("/api/auth/profile", { cookie })).data.emailVerified, false);
    assert.equal((await post("/api/auth/reset-password", { token, password: nextPassword, confirmPassword: nextPassword }, null)).status, 400);
    assert.equal((await post("/api/auth/verify-email", { token }, null)).status, 200);
    assert.equal((await post("/api/auth/verify-email", { token }, null)).status, 400);
    assert.equal((await request("/api/auth/profile", { cookie })).data.emailVerified, true);
    assert.equal((await request("/api/auth/profile", { cookie: otherCookie })).data.emailVerified, false);
    assert.equal((await post("/api/auth/send-verification", {}, null)).status, 401);
    assert.equal((await post("/api/auth/send-verification", {})).data.alreadyVerified, true);
  });
  await t.test("Expired verification links fail and an owner can resend without changing credentials", async () => {
    const other = await request("/api/auth/profile", { cookie: otherCookie });
    const old = secret(latest("verify", other.data.email));
    await User.updateOne({ _id: other.data._id }, { $set: { emailVerificationExpiresAt: new Date(Date.now() - 1000), emailVerificationRequestedAt: new Date(Date.now() - 61000) } });
    assert.equal((await post("/api/auth/verify-email", { token: old }, null)).status, 400);
    assert.equal((await post("/api/auth/send-verification", {}, otherCookie)).status, 200);
    const token = secret(latest("verify", other.data.email)); assert.notEqual(token, old);
    assert.equal((await post("/api/auth/verify-email", { token: old }, null)).status, 400);
    assert.equal((await post("/api/auth/verify-email", { token }, null)).status, 200);
    assert.equal((await post("/api/auth/login", { email: other.data.email, password }, null)).status, 200);
  });
  await t.test("Forgot-password hides account existence and throttles repeat requests without changing the password", async () => {
    const category = await Category.create({ name: "Recovery fixtures", slug: "recovery-fixtures" });
    const item = await Product.create({ name: "Preserved cart item", slug: "preserved-cart-item", category: category._id, price: 500, stock: 5 });
    assert.equal((await post("/api/cart", { productId: String(item._id), quantity: 2 })).status, 201);
    await User.updateOne({ _id: owner }, { $set: { address: home } });
    const unknown = await post("/api/auth/forgot-password", { email: "missing-account@norda-test.example" }, null);
    const existing = await post("/api/auth/forgot-password", { email: email.toUpperCase() }, null);
    assert.equal(existing.status, 200); assert.deepEqual(existing.data, unknown.data);
    assert.equal(messages.some((mail) => mail.to === "missing-account@norda-test.example"), false);
    const count = messages.filter((mail) => mail.kind === "reset").length;
    assert.deepEqual((await post("/api/auth/forgot-password", { email }, null)).data, existing.data);
    assert.equal(messages.filter((mail) => mail.kind === "reset").length, count);
    assert.doesNotMatch(JSON.stringify(existing.data), /[a-f\d]{64}/);
    const stored = await User.findById(owner).select("+passwordResetHash");
    assert.equal(stored.passwordResetHash, tokenHash(secret(latest("reset"))));
    assert.equal((await post("/api/auth/login", { email, password }, null)).status, 200);
  });
  await t.test("Reset rejects malformed, weak, mismatched and expired submissions, and replacement invalidates old links", async () => {
    const token = secret(latest("reset"));
    for (const body of [{ token: {}, password: nextPassword }, { token, password: "short", confirmPassword: "short" }, { token, password: nextPassword, confirmPassword: "different" }, { token, password: "🙂".repeat(30), confirmPassword: "🙂".repeat(30) }]) assert.equal((await post("/api/auth/reset-password", body, null)).status, 400);
    await User.updateOne({ _id: owner }, { $set: { passwordResetExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await post("/api/auth/reset-password", { token, password: nextPassword, confirmPassword: nextPassword }, null)).status, 400);
    await ageResetRequest(); await post("/api/auth/forgot-password", { email }, null);
    assert.notEqual(secret(latest("reset")), token);
    assert.equal((await post("/api/auth/reset-password", { token, password: nextPassword, confirmPassword: nextPassword }, null)).status, 400);
  });
  await t.test("Concurrent reset consumes one link, revokes old sessions, keeps user data and requires normal sign-in", async () => {
    const before = await User.findById(owner).select("+password");
    const token = secret(latest("reset")); const oldCookie = cookie;
    const results = await Promise.all([1, 2].map(() => post("/api/auth/reset-password", { token, password: nextPassword, confirmPassword: nextPassword }, null)));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    assert.ok(results.every((r) => !r.data.token && !r.data._id));
    assert.equal((await request("/api/auth/profile", { cookie: oldCookie })).status, 401);
    assert.equal((await post("/api/auth/login", { email, password }, null)).status, 401);
    const logged = await post("/api/auth/login", { email, password: nextPassword }, null); assert.equal(logged.status, 200); cookie = logged.cookie;
    const after = await User.findById(owner).select("+password +passwordResetHash");
    assert.equal(after.name, before.name); assert.equal(after.email, before.email); assert.equal(after.role, before.role); assert.notEqual(after.password, before.password); assert.equal(after.passwordResetHash, undefined);
    assert.equal(after.address.line1, before.address.line1);
    assert.equal((await request("/api/cart", { cookie })).data.items[0].quantity, 2);
    assert.equal((await request("/api/cart", { method: "DELETE", cookie })).status, 200);
    assert.ok(latest("password-changed"));
    assert.equal((await post("/api/auth/reset-password", { token, password: nextPassword, confirmPassword: nextPassword }, null)).status, 400);
  });
  await t.test("An authenticated password change also invalidates an outstanding reset link", async () => {
    await ageResetRequest(); await post("/api/auth/forgot-password", { email }, null);
    const token = secret(latest("reset"));
    const updated = await put("/api/auth/profile", { currentPassword: nextPassword, password: "ChangedInProfile123" });
    assert.equal(updated.status, 200); cookie = updated.cookie;
    assert.equal((await post("/api/auth/reset-password", { token, password: password, confirmPassword: password }, null)).status, 400);
    assert.equal((await request("/api/auth/profile", { cookie })).status, 200);
  });
  await t.test("A legacy delivery address appears without migration and survives the first new saved address", async () => {
    await User.updateOne({ _id: owner }, { $set: { address: home }, $unset: { addresses: 1, defaultAddressId: 1 } });
    let profile = await request("/api/auth/profile", { cookie });
    assert.equal(profile.data.addresses[0]._id, "legacy"); assert.equal(profile.data.address.line1, home.line1);
    const before = await User.findById(owner); assert.equal(before.addresses?.length || 0, 0);
    profile = await post("/api/auth/addresses", office); assert.equal(profile.status, 201); assert.equal(profile.data.addresses.length, 2);
    defaultId = profile.data.defaultAddressId; officeId = profile.data.addresses.find((entry) => entry.label === "Office")._id;
    assert.notEqual(defaultId, "legacy"); assert.equal(profile.data.address.line1, home.line1);
    assert.equal(profile.data.addresses.filter((entry) => entry.isDefault).length, 1);
    assert.equal((await request("/api/auth/addresses", { cookie })).data.limit, 10);
  });
  await t.test("Address APIs validate input and enforce account ownership, including default and delete", async () => {
    assert.equal((await request("/api/auth/addresses")).status, 401);
    for (const body of [[], { ...home, label: "" }, { ...home, phone: "bad-phone" }, { ...home, isDefault: "true" }, { ...home, city: 123 }, { ...home, line1: "a".repeat(121) }]) assert.equal((await post("/api/auth/addresses", body)).status, 400);
    for (const [method, suffix, body] of [["PUT", "", office], ["PUT", "/default", {}], ["DELETE", "", undefined]]) assert.equal((await request("/api/auth/addresses/" + officeId + suffix, { method, body, cookie: otherCookie })).status, 404);
    assert.equal((await put("/api/auth/addresses/not-valid", office)).status, 400);
  });
  await t.test("Default selection and editing coexist with legacy profile updates", async () => {
    const changed = await put("/api/auth/addresses/" + officeId + "/default", {}); assert.equal(changed.status, 200); assert.equal(changed.data.address.line1, office.line1);
    const edit = await put("/api/auth/addresses/" + defaultId, { ...home, label: "Family home" }); assert.equal(edit.status, 200); assert.equal(edit.data.defaultAddressId, officeId);
    const legacy = await put("/api/auth/profile", { address: { ...office, line1: "Updated office road" } }); assert.equal(legacy.status, 200); cookie = legacy.cookie;
    assert.equal(legacy.data.addresses.find((entry) => entry._id === officeId).line1, "Updated office road");
  });
  await t.test("Checkout keeps the preferred address and order/invoice snapshots survive address editing and deletion", async () => {
    const category = await Category.create({ name: "Account fixtures", slug: "account-fixtures" });
    product = await Product.create({ name: "Address journey item", slug: "address-journey-item", category: category._id, price: 1500, stock: 20, images: [] });
    await post("/api/cart", { productId: String(product._id), quantity: 1 });
    const order = await post("/api/orders", { paymentMethod: "cod", shippingAddress: home, checkoutKey: "account-address-checkout" });
    assert.equal(order.status, 201); snapshot = order.data;
    assert.equal((await request("/api/auth/profile", { cookie })).data.address.line1, "Updated office road");
    assert.equal((await put("/api/auth/addresses/" + defaultId, { ...home, line1: "New home road" })).status, 200);
    assert.equal((await request("/api/auth/addresses/" + defaultId, { method: "DELETE", cookie })).status, 200);
    const invoice = await request("/api/invoices/order/" + snapshot._id, { cookie });
    assert.equal(invoice.data.shippingAddress.line1, home.line1);
    assert.equal((await request("/api/orders/" + snapshot._id, { cookie })).data.shippingAddress.line1, home.line1);
  });
  await t.test("Deleting the last saved address leaves an empty book, with no resurrected checkout address", async () => {
    const removed = await request("/api/auth/addresses/" + officeId, { method: "DELETE", cookie });
    assert.equal(removed.status, 200); assert.deepEqual(removed.data.addresses, []); assert.equal(removed.data.defaultAddressId, null);
    const profile = await request("/api/auth/profile", { cookie }); assert.deepEqual(profile.data.addresses, []); assert.equal(profile.data.address, null);
  });
  await t.test("Concurrent address writes respect the ten-address limit and exactly one default", async () => {
    for (let i = 0; i < 9; i++) assert.equal((await post("/api/auth/addresses", { ...home, label: "Address " + i })).status, 201);
    const results = await Promise.all([1, 2].map((i) => post("/api/auth/addresses", { ...home, label: "Concurrent " + i, isDefault: true })));
    assert.equal(results.filter((r) => r.status === 201).length, 1); assert.ok(results.some((r) => [400, 409].includes(r.status)));
    const book = (await request("/api/auth/addresses", { cookie })).data;
    assert.equal(book.addresses.length, 10); assert.equal(book.addresses.filter((entry) => entry.isDefault).length, 1);
    assert.equal((await post("/api/auth/addresses", home)).status, 400);
  });
  await t.test("Public account email requests are also limited per IP", async () => {
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await post("/api/auth/forgot-password", { email: "absent@norda-test.example" }, null)).status);
    assert.ok(statuses.includes(429)); assert.ok(statuses.every((status) => [200, 429].includes(status)));
  });
};

const test = require("node:test");
const assert = require("node:assert/strict");
process.env.NODE_ENV = "test";
const { installMemoryStore } = require("../test-support/memoryStore");
const store = installMemoryStore();
const inventory = require("../services/inventoryService");
const { parseVariants, variantSummary, publicProduct } = require("../services/variantService");
const notifications = require("../services/notificationService");
const { withDatabaseUnit } = require("../services/databaseUnit");
const mail = require("../services/mailService");
const originalMail = mail.sendAccountMail;
const pId = "a".repeat(24), vId = "b".repeat(24), otherId = "c".repeat(24), uId = "d".repeat(24), orderId = "e".repeat(24);
test.beforeEach(() => { store.reset(); });
test.afterEach(() => { mail.sendAccountMail = originalMail; });
test.after(() => store.restore());
const variant = (extra = {}) => ({ _id: vId, sku: "NOR-FOREST-M", size: "M", color: "Forest", price: 1000, discountPrice: 800, stock: 2, images: ["/uploads/forest.webp"], isActive: true, ...extra });
const product = () => store.add("Product", { _id: pId, name: "Shirt", price: 1000, stock: 5, images: [], variants: [variant(), variant({ _id: otherId, sku: "NOR-CREAM-L", size: "L", color: "Cream", stock: 3 })] });
const fixture = () => { const user = store.add("User", { _id: uId, name: "A buyer", email: "buyer@norda.example" }); const order = store.add("Order", { _id: orderId, user: user._id, status: "pending", paymentStatus: "pending", totalAmount: 920, paymentMethod: "cod", items: [{ name: "Shirt", sku: "NOR-FOREST-M", quantity: 1 }], createdAt: new Date().toISOString() }); return order; };
const queued = (extra = {}) => store.models.OrderNotification.create({ order: orderId, user: uId, key: orderId + ":confirmation:created", topic: "confirmation", to: "buyer@norda.example", subject: "Order confirmed", text: "A recorded order", status: "queued", attempts: 0, nextAttemptAt: new Date(0), ...extra });
test("Selection uses the chosen SKU price/stock/image and never falls back to another variant", () => {
  const p = product(), selected = inventory.selection(p, vId); assert.equal(selected.price, 800); assert.equal(selected.stock, 2); assert.equal(selected.image, "/uploads/forest.webp");
  for (const id of [undefined, "bad", "f".repeat(24)]) assert.throws(() => inventory.selection(p, id));
  p.variants[0].isActive = false; assert.throws(() => inventory.selection(p, vId), /unavailable/);
});
test("A simple product keeps its original selection behavior", () => {
  const p = { _id: pId, price: 500, discountPrice: 400, stock: 3, images: [] }; assert.equal(inventory.selection(p).price, 400); assert.throws(() => inventory.selection(p, vId));
});
test("Variant reservation failure compensates an earlier SKU without affecting other stock", async () => {
  product(); await assert.rejects(withDatabaseUnit(async (unit) => { await inventory.reserveItem({ product: pId, variantId: vId, quantity: 2, name: "M" }, unit); await inventory.reserveItem({ product: pId, variantId: otherId, quantity: 4, name: "L" }, unit); }));
  assert.equal(store.get("Product", pId).variants[0].stock, 2); assert.equal(store.get("Product", pId).variants[1].stock, 3); assert.equal(store.get("Product", pId).stock, 5);
});
test("Variant inventory cannot be consumed through a base product item", async () => {
  product(); await assert.rejects(withDatabaseUnit((unit) => inventory.reserveItem({ product: pId, quantity: 1, name: "Shirt" }, unit)), /stock/); assert.equal(store.get("Product", pId).stock, 5);
});
test("Inactive variants accept historical restock but cannot be reserved for a new sale", async () => {
  const p = product(); await store.models.Product.updateOne({ _id: pId }, { $set: { variants: p.variants.map((v) => ({ ...v, isActive: false })) } });
  await withDatabaseUnit((unit) => inventory.restoreItem({ product: pId, variantId: vId, quantity: 1 }, unit)); assert.equal(store.get("Product", pId).variants[0].stock, 3);
  await assert.rejects(withDatabaseUnit((unit) => inventory.reserveItem({ product: pId, variantId: vId, quantity: 1, name: "Shirt" }, unit)));
});
test("Variant parser rejects duplicate options, unsafe prices, excess images and foreign identifiers", async () => {
  const row = variant(); delete row._id;
  await assert.rejects(parseVariants([row, { ...row, sku: "NOR-OTHER" }]), /unique/);
  for (const bad of [{ price: Infinity }, { price: 0 }, { price: 1.001 }, { stock: 1.5 }, { stock: -1 }, { isActive: "true" }, { images: ["javascript:bad"] }, { _id: 0 }, { images: Array(7).fill("/uploads/a.webp") }]) await assert.rejects(parseVariants([{ ...row, ...bad }]));
});
test("SKU parsing normalizes case and detects conflicts across products", async () => {
  product(); await assert.rejects(parseVariants([{ ...variant(), _id: undefined, sku: "nor-forest-m" }]), /SKU/);
  const parsed = await parseVariants([{ ...variant(), _id: undefined, sku: "nor-new-option" }]); assert.equal(parsed[0].sku, "NOR-NEW-OPTION");
});
test("Inventory totals stay safe and public stock excludes retired options", () => {
  const rows = [variant({ isActive: false }), variant({ _id: otherId, stock: 3, price: 1200, discountPrice: 900 })];
  assert.equal(variantSummary(rows).price, 1200); const p = publicProduct({ variants: rows, stock: 5, inventoryVersion: 2 }); assert.equal(p.stock, 3); assert.equal(p.inventoryVersion, undefined);
  assert.throws(() => variantSummary([variant({ stock: Number.MAX_SAFE_INTEGER }), variant({ _id: otherId, stock: 1 })]), /range/);
});
test("Email is held until commit and a rollback leaves no deliverable notification", async () => {
  const order = fixture(), sent = []; mail.sendAccountMail = async (m) => sent.push(m);
  await assert.rejects(withDatabaseUnit(async (unit) => { const row = await notifications.queueMessage(order, "confirmation", "created", unit); assert.equal((await store.models.OrderNotification.findById(row._id)).status, "held"); await notifications.sendNotification(row._id); assert.equal(sent.length, 0); throw new Error("Rollback"); }));
  assert.equal(store.records.OrderNotification.size, 0); assert.equal(sent.length, 0);
});
test("Multiple payment transitions inside one transaction produce the final state email only", async () => {
  const order = fixture(), cancelled = { ...order, status: "cancelled", paymentStatus: "cancelled", cancelledAt: new Date() };
  await withDatabaseUnit(async (unit) => { await notifications.queueOrderChanges(cancelled, order, unit); await notifications.queueOrderChanges({ ...cancelled, paymentStatus: "failed" }, cancelled, unit); });
  const rows = [...store.records.OrderNotification.values()]; assert.equal(rows.filter((r) => r.topic === "payment").length, 1); assert.ok(rows.find((r) => r.topic === "payment").text.includes("Payment: failed")); assert.equal(rows.filter((r) => r.topic === "cancellation").length, 1);
});
test("Five delivery failures stop automatic retry and preserve a redacted error", async () => {
  fixture(); const row = await queued({ attempts: 4 }); mail.sendAccountMail = async () => { throw new Error("password=sensitive"); }; await notifications.sendNotification(row._id);
  const saved = store.get("OrderNotification", row._id); assert.equal(saved.status, "failed"); assert.equal(saved.attempts, 5); assert.ok(!saved.lastError.includes("sensitive")); await notifications.sendNotification(row._id); assert.equal(store.get("OrderNotification", row._id).attempts, 5);
});
test("Retries retain a stable email Message-ID and concurrent workers claim once", async () => {
  fixture(); const row = await queued(), ids = []; mail.sendAccountMail = async (message) => { ids.push(message.messageId); if (ids.length === 1) throw new Error("Network interruption"); return { delivery: "smtp" }; };
  await notifications.sendNotification(row._id); await store.models.OrderNotification.updateOne({ _id: row._id }, { $set: { nextAttemptAt: new Date(0) } }); await Promise.all([notifications.sendNotification(row._id), notifications.sendNotification(row._id)]);
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]); assert.equal(store.get("OrderNotification", row._id).status, "sent");
});
test("Worker recovers a stale claim and never retries an exhausted claim", async () => {
  fixture(); let count = 0; mail.sendAccountMail = async () => { count++; return { delivery: "smtp" }; };
  const row = await queued({ status: "sending", attempts: 1, claimedAt: new Date(Date.now() - 700000) }); await notifications.sweepNotifications(); assert.equal(count, 1); assert.equal(store.get("OrderNotification", row._id).status, "sent");
  const old = await queued({ key: "exhausted", status: "sending", attempts: 5, claimedAt: new Date(Date.now() - 700000) }); await notifications.sweepNotifications(); assert.equal(count, 1); assert.equal(store.get("OrderNotification", old._id).status, "failed");
});
test("Failed post-commit activation remains recoverable without failing the completed operation", async () => {
  const order = fixture(); store.fail("OrderNotification", "updateOne");
  const value = await withDatabaseUnit(async (unit) => { await notifications.queueMessage(order, "confirmation", "created", unit); return "committed"; }); assert.equal(value, "committed");
  const [held] = await store.models.OrderNotification.find({ order: orderId }); assert.equal(held.status, "held"); await notifications.activateHeld(held); assert.equal(store.get("OrderNotification", held._id).status, "queued");
});
test("Transactional links reject active schemes and production HTTP without exposing secrets", () => {
  const old = { CLIENT_APP_URL: process.env.CLIENT_APP_URL, NODE_ENV: process.env.NODE_ENV };
  try { process.env.CLIENT_APP_URL = "javascript:bad"; assert.equal(notifications.customerUrl({ _id: orderId }), ""); process.env.NODE_ENV = "production"; process.env.CLIENT_APP_URL = "http://store.example"; assert.equal(notifications.customerUrl({ _id: orderId }), ""); process.env.CLIENT_APP_URL = "https://user:secret@store.example"; assert.equal(notifications.customerUrl({ _id: orderId }), ""); process.env.CLIENT_APP_URL = "https://store.example"; assert.equal(new URL(notifications.customerUrl({ _id: orderId }, true)).pathname, "/order-tracking.html"); }
  finally { for (const [key, value] of Object.entries(old)) value === undefined ? delete process.env[key] : process.env[key] = value; }
});

test("Existing option identity cannot be reassigned to different physical size/color inventory", async () => {
  const p = product(), rows = p.variants.map((v) => ({ ...v, expectedStock: v.stock }));
  for (const change of [{ sku: "NEW-SKU" }, { size: "XL" }, { color: "Blue" }]) await assert.rejects(parseVariants([{ ...rows[0], ...change }, rows[1]], p), /historical inventory/);
  const updated = await parseVariants([{ ...rows[0], price: 1200 }, rows[1]], p); assert.equal(updated[0].price, 1200);
});

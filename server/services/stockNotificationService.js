const crypto = require("node:crypto"), Subscription = require("../models/StockSubscription"), Notice = require("../models/StockNotice"), Product = require("../models/Product"), User = require("../models/User");
const { withOperationLock } = require("./operationLock"), { hasPermission } = require("../utils/permissions"), httpError = require("../utils/httpError");
async function subscribe(user, body) { if (typeof body.enabled !== "boolean" || typeof body.includeWarehouses !== "boolean") throw httpError(400, "Choose true or false for email and warehouse alerts"); return Subscription.findOneAndUpdate({ user: user._id }, { $set: { enabled: body.enabled, includeWarehouses: body.includeWarehouses } }, { upsert: true, new: true }); }
async function* inventory() { let cursor; while (true) { const products = await Product.find({ isArchived: { $ne: true }, ...(cursor ? { _id: { $gt: cursor } } : {}) }).sort({ _id: 1 }).limit(200); if (!products.length) break; for (const p of products) { for (const v of p.variants?.length ? p.variants : [p]) { if (v.isActive === false) continue; yield { stockKey: String(p._id) + ":" + (v === p ? "base" : v._id) + ":online", name: p.name, sku: v.sku || "Base product", location: "Online fulfillment", quantity: v.stock, threshold: v.lowStockThreshold ?? p.lowStockThreshold ?? 5, warehouse: false }; } } cursor = products[products.length - 1]._id; if (products.length < 200) break; }
  const Warehouse = require("../models/Warehouse"), Stock = require("../models/WarehouseStock"); const locations = await Warehouse.find({ active: true });
  for (const w of locations) { let after; while (true) { const rows = await Stock.find({ warehouse: w._id, ...(after ? { _id: { $gt: after } } : {}) }).sort({ _id: 1 }).limit(200); for (const row of rows) { const p = await Product.findById(row.product); if (!p || p.isArchived) continue; const v = row.variantKey === "base" ? p : (p.variants || []).find(v => String(v._id) === row.variantKey); if (!v || v.isActive === false) continue; yield { stockKey: String(p._id) + ":" + row.variantKey + ":" + w._id, name: p.name, sku: v.sku || "Base product", location: w.name, quantity: row.quantity, threshold: row.lowStockThreshold ?? 5, warehouse: true }; } if (rows.length < 200) break; after = rows[rows.length - 1]._id; } }
}
async function scan() { return withOperationLock("inventory-notifications", async () => {
  const subs = await Subscription.find({ enabled: true });
  for (const sub of subs) {
    const user = await User.findById(sub.user); if (!hasPermission(user, "inventory")) continue;
    const seen = new Set();
    for await (const item of inventory()) {
      if (item.warehouse && !sub.includeWarehouses) continue; seen.add(item.stockKey); const previous = await Notice.findOne({ user: user._id, stockKey: item.stockKey }), low = item.quantity <= item.threshold;
      const fields = { ...item, low, ...(low && !previous?.low ? { episode: (previous?.episode || 0) + 1, status: "queued", attempts: 0, nextAttemptAt: new Date() } : !low ? { status: "idle" } : {}) }; delete fields.warehouse;
      await Notice.findOneAndUpdate({ user: user._id, stockKey: item.stockKey }, { $set: fields }, { upsert: true, new: true });
    }
    for (const row of await Notice.find({ user: user._id, low: true })) if (!seen.has(row.stockKey)) await Notice.updateOne({ _id: row._id }, { $set: { low: false, status: "idle" } });
  }
}); }
async function deliver() {
  for (const row of await Notice.find({ status: "sending", claimedAt: { $lt: new Date(Date.now() - 600000) } })) await Notice.updateOne({ _id: row._id, status: "sending" }, { $set: { status: row.attempts >= 5 ? "failed" : "queued", nextAttemptAt: new Date() } });
  for (const row of await Notice.find({ status: "queued", low: true, nextAttemptAt: { $lte: new Date() }, attempts: { $lt: 5 } }).sort({ createdAt: 1 }).limit(20)) {
    const sub = await Subscription.findOne({ user: row.user, enabled: true }), user = await User.findById(row.user); if (!sub || !hasPermission(user, "inventory") || (row.location !== "Online fulfillment" && !sub.includeWarehouses)) { await Notice.updateOne({ _id: row._id }, { $set: { status: "idle" } }); continue; }
    const claim = await Notice.findOneAndUpdate({ _id: row._id, status: "queued", low: true }, { $set: { status: "sending", claimedAt: new Date() }, $inc: { attempts: 1 } }, { new: true }); if (!claim) continue;
    try { const receipt = await require("./mailService").sendAccountMail({ to: user.email, subject: "Norda low stock: " + row.name.replace(/[\r\n]/g, " "), text: "Product: " + row.name + "\nSKU: " + row.sku + "\nLocation: " + row.location + "\nCurrent quantity: " + row.quantity + "\nAlert threshold: " + row.threshold + "\nReview inventory in the Norda staff workspace.", kind: "inventory_low", messageId: "<norda-stock-" + crypto.createHash("sha256").update(String(row._id) + ":" + row.episode).digest("hex") + "@norda.local>" }); await Notice.updateOne({ _id: row._id, status: "sending", episode: row.episode }, { $set: { status: "sent", transport: receipt.delivery, sentAt: new Date() } }); }
    catch { await Notice.updateOne({ _id: row._id, status: "sending", episode: row.episode }, { $set: { status: claim.attempts >= 5 ? "failed" : "queued", nextAttemptAt: new Date(Date.now() + 60000 * 2 ** claim.attempts) } }); }
  }
}
function startWorker() { let running, stopped = false; const tick = () => { if (!stopped && !running) running = require("./maintenanceService").withWriteLease(async () => { await scan(); await deliver(); }).catch(() => {}).finally(() => running = null); }; const timer = setInterval(tick, 60000); timer.unref(); tick(); return async () => { stopped = true; clearInterval(timer); if (running) await running; }; }
module.exports = { subscribe, inventory, scan, deliver, startWorker };

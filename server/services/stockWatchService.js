const crypto = require("node:crypto");
const Watch = require("../models/StockWatch"), Notice = require("../models/StockWatchNotice"), Product = require("../models/Product"), User = require("../models/User");
const { hash } = require("../utils/expansion");
const error = require("../utils/httpError");
const { objectId } = require("./orderOperationStore");
const { withOperationLock } = require("./operationLock");
async function availability(productId, variantKey) {
  const product = await Product.findById(productId);
  if (!product || product.isArchived) return null;
  const [available] = await require("./fulfillmentService").enrich([product]);
  try { return { product, selected: require("./inventoryService").selection(available, variantKey === "base" ? undefined : variantKey) }; } catch { return null; }
}
async function subscribe(user, body) {
  if (user.isGuest || !user.emailVerifiedAt) throw error(409, "Sign in with a verified email to request an availability alert");
  objectId(body.productId); const variantKey = String(body.variantId || "base");
  if (variantKey !== "base") objectId(variantKey);
  const item = await availability(body.productId, variantKey);
  if (!item) throw error(409, "This product option is unavailable");
  if (item.selected.stock > 0) throw error(409, "This option is already in stock; you can add it to your cart");
  return withOperationLock("stock-watch:" + user._id, async () => {
    const filter = { user: user._id, product: body.productId, variantKey }, current = await Watch.findOne(filter);
    if (current?.active) return { _id: current._id, active: true };
    if (await Watch.countDocuments({ user: user._id, active: true }) >= 100) throw error(409, "You can follow up to 100 sold-out product options");
    const row = current ? await Watch.findByIdAndUpdate(current._id, { $set: { active: true, fulfilledAt: null, unsubscribeHash: "", generation: current.generation + 1 } }, { new: true }) : await Watch.create({ ...filter, active: true, generation: 1 });
    return { _id: row._id, active: true };
  });
}
async function list(user) {
  const watches = await Watch.find({ user: user._id }).sort({ updatedAt: -1 }).limit(200).populate("product", "name images");
  const result = [];
  for (const w of watches) {
    const notice = await Notice.findOne({ watch: w._id, generation: w.generation });
    result.push({ _id: w._id, product: w.product, variantKey: w.variantKey, active: w.active, fulfilledAt: w.fulfilledAt, deliveryStatus: notice?.status || "waiting", createdAt: w.createdAt });
  }
  return result;
}
async function remove(user, id) { objectId(id); const row = await Watch.findOneAndUpdate({ _id: id, user: user._id }, { $set: { active: false, unsubscribeHash: "" } }, { new: true }); if (!row) throw error(404, "Availability alert not found"); return { active: false }; }
async function unsubscribe(body) {
  objectId(body.id); if (!/^[a-f0-9]{64}$/.test(body.token || "")) throw error(400, "Invalid unsubscribe link");
  const row = await Watch.findOneAndUpdate({ _id: body.id, unsubscribeHash: hash(body.token) }, { $set: { active: false, unsubscribeHash: "" } }, { new: true });
  if (!row) throw error(400, "Unsubscribe link expired or was already used"); return { active: false };
}
let cursor = null;
async function scan() {
  let rows = await Watch.find({ active: true, ...(cursor ? { _id: { $gt: cursor } } : {}) }).sort({ _id: 1 }).limit(250);
  if (!rows.length) { cursor = null; rows = await Watch.find({ active: true }).sort({ _id: 1 }).limit(250); }
  for (const w of rows) {
    cursor = w._id; const item = await availability(w.product, w.variantKey); if (!item?.selected.stock) continue;
    await withOperationLock("stock-watch-notice:" + w._id, async () => {
      const existing = await Notice.findOne({ watch: w._id, generation: w.generation });
      if (existing) {
        if (["sent", "local"].includes(existing.status)) await Watch.updateOne({ _id: w._id, generation: w.generation }, { $set: { active: false, fulfilledAt: existing.sentAt || new Date() } });
        if (existing.status === "cancelled") await Notice.updateOne({ _id: existing._id, status: "cancelled" }, { $set: { status: "queued", attempts: 0, nextAttemptAt: new Date() } });
        return;
      }
      const token = crypto.randomBytes(32).toString("hex");
      const changed = await Watch.updateOne({ _id: w._id, active: true, generation: w.generation }, { $set: { unsubscribeHash: hash(token) } });
      if (!changed.matchedCount) return;
      try { await Notice.create({ watch: w._id, generation: w.generation, user: w.user, product: w.product, variantKey: w.variantKey, status: "queued", attempts: 0, nextAttemptAt: new Date(), unsubscribeToken: token, messageId: "<norda-stock-" + w._id + "-" + w.generation + "@norda.local>" }); } catch (e) { if (e.code !== 11000) throw e; }
    });
  }
}
async function deliver() {
  for (const stale of await Notice.find({ status: "sending", claimedAt: { $lt: new Date(Date.now() - 120000) } }).limit(50)) await Notice.updateOne({ _id: stale._id, status: "sending" }, { $set: { status: stale.attempts >= 5 ? "failed" : "queued", nextAttemptAt: new Date() } });
  for (const candidate of await Notice.find({ status: "queued", nextAttemptAt: { $lte: new Date() }, attempts: { $lt: 5 } }).sort({ createdAt: 1 }).limit(30)) {
    const claimed = await Notice.findOneAndUpdate({ _id: candidate._id, status: "queued" }, { $set: { status: "sending", claimedAt: new Date() }, $inc: { attempts: 1 } }, { new: true });
    if (!claimed) continue;
    const row = await Notice.findById(claimed._id).select("+unsubscribeToken");
    try {
      const watch = await Watch.findById(row.watch), owner = await User.findById(row.user), item = await availability(row.product, row.variantKey);
      if (!watch?.active || watch.generation !== row.generation || !owner?.emailVerifiedAt || !item?.selected.stock) { await Notice.updateOne({ _id: row._id, status: "sending" }, { $set: { status: "cancelled" } }); continue; }
      const base = process.env.CLIENT_APP_URL || "http://localhost:5000", link = new URL("product-detail.html?id=" + row.product, base.replace(/\/?$/, "/"));
      const optOut = new URL("stock-alerts.html", base.replace(/\/?$/, "/")); optOut.hash = watch._id + ":" + row.unsubscribeToken;
      if (link.protocol !== "https:" && process.env.NODE_ENV === "production") throw error(503, "Configure a public HTTPS store URL for availability email");
      const receipt = await require("./mailService").sendAccountMail({ to: owner.email, subject: "Back in stock: " + item.product.name, text: ["Hello " + owner.name + ",", item.product.name + (item.selected.sku ? " — " + item.selected.sku : "") + " is available again.", "Price: BDT " + item.selected.price.toFixed(2), "Stock can change; this email does not reserve an item.", link.href, "Stop this alert: " + optOut.href].join("\n\n"), kind: "back_in_stock", messageId: row.messageId });
      await Notice.updateOne({ _id: row._id, status: "sending" }, { $set: { status: receipt.delivery === "local" ? "local" : "sent", transport: receipt.delivery, sentAt: new Date(), lastError: "" } });
      await Watch.updateOne({ _id: watch._id, generation: row.generation }, { $set: { active: false, fulfilledAt: new Date() } });
    } catch { await Notice.updateOne({ _id: row._id, status: "sending" }, { $set: { status: row.attempts >= 5 ? "failed" : "queued", nextAttemptAt: new Date(Date.now() + 60000 * 2 ** row.attempts), lastError: "Availability email could not be accepted. Check mail delivery configuration." } }); }
  }
}
function startWorker() { let stopped = false, running; const tick = () => { if (!stopped && !running) running = require("./maintenanceService").withWriteLease(async () => { await scan(); await deliver(); }).catch(() => {}).finally(() => running = null); }; const timer = setInterval(tick, 60000); timer.unref(); tick(); return async () => { stopped = true; clearInterval(timer); if (running) await running; }; }
module.exports = { subscribe, list, remove, unsubscribe, scan, deliver, availability, startWorker };

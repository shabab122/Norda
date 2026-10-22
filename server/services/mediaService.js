const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const Upload = require("../models/Upload");
const cloud = require("./cloudinaryService");
const { withOperationLock } = require("./operationLock");
const { objectId } = require("./orderOperationStore");
const httpError = require("../utils/httpError");
const { escapeRegExp } = require("../utils/validation");
const uploadRoot = path.resolve(__dirname, "../uploads");
function localPath(filename) { if (typeof filename !== "string" || !/^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|gif)$/.test(filename)) throw httpError(409, "Invalid managed upload filename"); return path.join(uploadRoot, filename); }
const state = (a) => a.status || "active";
async function persistUpload(file, user) {
  const config = cloud.configuration(), filePath = "/uploads/" + file.filename;
  if (config.storage === "cloudinary" && !config.ready) throw httpError(503, "Configure Cloudinary before uploading, or keep the existing local storage mode");
  const fields = { uploadedBy: user._id, originalName: path.basename(file.originalname).slice(0, 255), filename: file.filename, url: filePath, mimeType: file.mimetype, size: file.size, storage: config.storage, status: config.storage === "local" ? "active" : "uploading", sourceHash: crypto.createHash("sha256").update(await fs.readFile(file.path)).digest("hex"), ...(config.storage === "cloudinary" ? { cloudName: config.cloudName, cloudPublicId: "norda/uploads/" + crypto.randomUUID() } : {}) };
  const record = await Upload.create(fields);
  if (config.storage === "local") return record;
  try {
    const meta = await cloud.upload(file, record.cloudPublicId);
    const saved = await Upload.findOneAndUpdate({ _id: record._id, status: "uploading" }, { $set: { ...meta, url: meta.cloudUrl, status: "active", lastError: "" } }, { new: true });
    if (!saved) throw httpError(409, "Uploaded asset needs reconciliation");
    await fs.unlink(file.path).catch(() => {}); return saved;
  } catch (e) {
    await Upload.updateOne({ _id: record._id }, { $set: { status: e.uncertain === false ? "failed" : "unknown", lastError: "Cloud upload did not finish cleanly. Reconcile before using this asset." } }).catch(() => {});
    e.keepUploadFile = true; throw e;
  }
}
async function reconcileAsset(id) {
  objectId(id); return withOperationLock("asset:" + id, async () => {
    const asset = await Upload.findById(id); if (!asset) throw httpError(404, "Image not found");
    if (state(asset) === "active") return asset;
    if (!["unknown", "uploading", "cleanup_unknown", "deleting"].includes(state(asset)) || asset.storage !== "cloudinary") throw httpError(409, "This image has no cloud operation to reconcile");
    const current = await cloud.inspect(asset);
    if (["cleanup_unknown", "deleting"].includes(state(asset))) {
      if (current) throw httpError(409, "The cloud image still exists. Run guarded cleanup again after checking references.");
      await fs.unlink(localPath(asset.filename)).catch((e) => { if (e.code !== "ENOENT") throw e; });
      return Upload.findByIdAndUpdate(id, { $set: { status: "deleted", deletedAt: new Date(), lastError: "" } }, { new: true });
    }
    if (!current) return Upload.findByIdAndUpdate(id, { $set: { status: "failed", lastError: "No cloud asset was found; the source file is retained for store review." } }, { new: true });
    if (asset.cloudAssetId && current.cloudAssetId !== asset.cloudAssetId) throw httpError(409, "Cloud asset identity changed; store review is required");
    const saved = await Upload.findByIdAndUpdate(id, { $set: { ...current, ...(asset.migrated ? {} : { url: current.cloudUrl }), status: "active", lastError: "" } }, { new: true });
    await fs.unlink(localPath(asset.filename)).catch(() => {}); return saved;
  });
}
function referencePattern(asset) {
  const local = "(?:^|/)uploads/" + escapeRegExp(asset.filename) + "(?:[?#]|$)";
  const remote = asset.cloudPublicId ? "|^https://res\\.cloudinary\\.com/" + escapeRegExp(asset.cloudName) + "/image/upload/(?:.*/)?" + escapeRegExp(asset.cloudPublicId) + "(?:\\.[a-zA-Z0-9]+)?(?:[?#]|$)" : "";
  return local + remote;
}
async function isReferenced(asset) {
  const match = { $regex: referencePattern(asset) };
  const checks = [["Product", { $or: [{ images: match }, { "variants.images": match }] }], ["Order", { "items.image": match }], ["ItemReturnCase", { "items.replacement.image": match }], ["StoreSettings", { "hero.imageUrl": match }], ["Category", { image: match }], ["Brand", { logo: match }]];
  for (const [name, filter] of checks) if (await require("../models/" + name).exists(filter)) return true;
  return false;
}
const safeAsset = (a) => ({ _id: a._id, filename: a.filename, url: a.url, cloudUrl: a.cloudUrl || "", storage: a.storage || "local", status: state(a), size: a.size, mimeType: a.mimeType, createdAt: a.createdAt, lastError: a.lastError || "" });
async function candidates() {
  const rows = await Upload.find({ createdAt: { $lt: new Date(Date.now() - 7 * 86400000) }, $or: [{ status: { $in: ["active", "failed", "cleanup_unknown"] } }, { status: { $exists: false } }] }).sort({ createdAt: 1 }).limit(100);
  const items = []; for (const a of rows) if (!await isReferenced(a)) items.push({ ...safeAsset(a), confirmation: crypto.createHash("sha256").update([a._id, a.url, a.cloudPublicId || "", state(a), a.updatedAt || a.createdAt].join(":" )).digest("hex") });
  return { items, minimumAgeDays: 7, scanned: rows.length, limit: 100 };
}
async function cleanupAsset(id, body) {
  objectId(id); if (body.confirmed !== true || typeof body.confirmation !== "string") throw httpError(400, "Preview unused media and explicitly confirm cleanup");
  return withOperationLock("media-references", () => withOperationLock("asset:" + id, async () => {
    let a = await Upload.findById(id); if (!a) throw httpError(404, "Image not found"); if (state(a) === "deleted") return safeAsset(a);
    const token = crypto.createHash("sha256").update([a._id, a.url, a.cloudPublicId || "", state(a), a.updatedAt || a.createdAt].join(":" )).digest("hex");
    if (body.confirmation !== token || Date.now() - new Date(a.createdAt).getTime() < 7 * 86400000 || !["active", "failed", "cleanup_unknown"].includes(state(a))) throw httpError(409, "Cleanup preview changed or this image is too recent. Preview again.");
    if (await isReferenced(a)) throw httpError(409, "This image is used by catalog, settings or purchase history and cannot be deleted");
    a = await Upload.findByIdAndUpdate(id, { $set: { status: "deleting" } }, { new: true });
    try {
      if (a.storage === "cloudinary") { const existing = await cloud.inspect(a); if (existing && existing.cloudAssetId !== a.cloudAssetId && a.cloudAssetId) throw httpError(409, "Cloud identity changed"); if (existing) await cloud.destroy(a); }
      await fs.unlink(localPath(a.filename)).catch((e) => { if (e.code !== "ENOENT") throw e; });
      return safeAsset(await Upload.findByIdAndUpdate(id, { $set: { status: "deleted", deletedAt: new Date(), lastError: "" } }, { new: true }));
    } catch (e) { await Upload.updateOne({ _id: id }, { $set: { status: "cleanup_unknown", lastError: "Cleanup result needs store review; source identity and references are retained." } }); throw e; }
  }));
}
async function migrateAsset(id) {
  objectId(id); return withOperationLock("asset:" + id, async () => {
    const a = await Upload.findById(id); if (!a) throw httpError(404, "Image not found"); if (a.storage === "cloudinary" && state(a) === "active") return safeAsset(a);
    const config = cloud.configuration(); if (!config.ready) throw httpError(503, "Configure Cloudinary before migrating an existing upload");
    if (!['active', 'failed'].includes(state(a)) || a.storage === "cloudinary") throw httpError(409, "Reconcile the current cloud operation first");
    const file = { path: localPath(a.filename), filename: a.filename, mimetype: a.mimeType };
    const publicId = "norda/uploads/" + crypto.randomUUID();
    await Upload.updateOne({ _id: id }, { $set: { storage: "cloudinary", status: "uploading", cloudName: config.cloudName, cloudPublicId: publicId, migrated: true } });
    try { const meta = await cloud.upload(file, publicId); const saved = await Upload.findByIdAndUpdate(id, { $set: { ...meta, status: "active", lastError: "" } }, { new: true }); await fs.unlink(file.path).catch(() => {}); return safeAsset(saved); }
    catch (e) { await Upload.updateOne({ _id: id }, { $set: { status: "unknown", lastError: "Migration result needs reconciliation. The original file is retained." } }); throw e; }
  });
}
async function assertUsableReferences(body) {
  const values = [];
  function walk(value, key = "") { if (Array.isArray(value)) { for (const v of value) walk(v, key); } else if (value && typeof value === "object") { for (const [k, v] of Object.entries(value)) walk(v, k); } else if (typeof value === "string" && ["images", "image", "logo", "imageUrl"].includes(key)) values.push(value); }
  walk(body);
  for (const url of values) {
    const a = await Upload.findOne({ $or: [{ url }, { cloudUrl: url }] });
    if (a && state(a) !== "active") throw httpError(409, "This image is unavailable or has a pending storage operation. Choose an active upload.");
    // Transformed URLs must not revive a deleted managed Cloudinary asset.
    let decoded = url; try { decoded = decodeURIComponent(url); } catch { /* Keep validation non-destructive for legacy URLs. */ }
    const owned = decoded.match(/norda\/uploads\/([a-f0-9-]{36})/); if (owned) { const known = await Upload.findOne({ cloudPublicId: "norda/uploads/" + owned[1] }); if (known && state(known) !== "active") throw httpError(409, "This managed cloud image is unavailable"); }
  }
}
const guard = (handler) => async (req, res, next) => { try { await withOperationLock("media-references", async () => { await assertUsableReferences(req.body); return handler(req, res, next); }); } catch (e) { next(e); } };
async function legacyRedirect(req, res, next) { try { if (!/^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|gif)$/.test(req.params.filename)) return next(); const a = await Upload.findOne({ filename: req.params.filename, storage: "cloudinary", status: "active", migrated: true }); if (!a) return next(); const url = cloud.secureCloudUrl(a.cloudUrl, a.cloudName); if (!url) return next(); return res.redirect(307, url); } catch (e) { next(e); } }
module.exports = { localPath, persistUpload, reconcileAsset, safeAsset, isReferenced, candidates, cleanupAsset, migrateAsset, assertUsableReferences, guard, legacyRedirect, referencePattern };

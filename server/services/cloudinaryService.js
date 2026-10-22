const fs = require("node:fs/promises");
const httpError = require("../utils/httpError");
const configuration = () => {
  const storage = process.env.MEDIA_STORAGE || "local";
  if (!["local", "cloudinary"].includes(storage)) throw httpError(503, "MEDIA_STORAGE must be local or cloudinary");
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "", key = process.env.CLOUDINARY_API_KEY || "", secret = process.env.CLOUDINARY_API_SECRET || "";
  const ready = /^[a-zA-Z0-9_-]{2,80}$/.test(cloudName) && /^[a-zA-Z0-9_-]{4,120}$/.test(key) && secret.length >= 8;
  return { storage, ready, cloudName, key, secret };
};
function secureCloudUrl(value, cloudName) { try { const u = new URL(value); return u.protocol === "https:" && u.hostname === "res.cloudinary.com" && !u.username && !u.password && u.pathname.startsWith("/" + cloudName + "/image/upload/") ? u.href : ""; } catch { return ""; } }
async function request(action, { method = "POST", body, cloudName } = {}) {
  const c = configuration(); if (!c.ready || (cloudName && cloudName !== c.cloudName)) throw httpError(503, "Configure the matching Cloudinary account before this operation");
  let response;
  try { response = await fetch("https://api.cloudinary.com/v1_1/" + c.cloudName + "/" + action, { method, body, headers: { Authorization: "Basic " + Buffer.from(c.key + ":" + c.secret).toString("base64") }, signal: AbortSignal.timeout(20000), redirect: "error" }); }
  catch { const e = httpError(502, "Cloud image operation has an unknown result. Reconcile this asset before retrying."); e.uncertain = true; throw e; }
  if (response.status === 404) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) { const e = httpError(502, "Cloud image provider rejected the operation. Check the account configuration."); e.uncertain = response.status >= 500 || !data; throw e; }
  return data;
}
function metadata(data, publicId, cloudName) {
  const url = secureCloudUrl(data?.secure_url, cloudName);
  if (!url || data.public_id !== publicId || typeof data.asset_id !== "string" || !Number.isSafeInteger(data.bytes) || data.bytes < 1 || data.bytes > 5 * 1024 * 1024 || !["jpg", "jpeg", "png", "webp", "gif"].includes(data.format)) { const e = httpError(502, "Cloud image identity or content did not match this upload"); e.uncertain = true; throw e; }
  return { cloudName, cloudPublicId: publicId, cloudAssetId: data.asset_id, cloudUrl: url, cloudVersion: data.version };
}
async function upload(file, publicId) { const c = configuration(); if (!c.ready) throw httpError(503, "Cloudinary image storage needs its own account configuration"); const form = new FormData(); form.set("file", new Blob([await fs.readFile(file.path)], { type: file.mimetype }), file.filename); form.set("public_id", publicId); form.set("overwrite", "false"); return metadata(await request("image/upload", { body: form }), publicId, c.cloudName); }
async function inspect(asset) { const data = await request("resources/image/upload/" + encodeURIComponent(asset.cloudPublicId), { method: "GET", cloudName: asset.cloudName }); return data ? metadata(data, asset.cloudPublicId, asset.cloudName) : null; }
async function destroy(asset) { if (!/^norda\/uploads\/[a-f0-9-]{36}$/.test(asset.cloudPublicId || "")) throw httpError(409, "Only application-owned uploaded assets can be cleaned"); const form = new URLSearchParams({ public_id: asset.cloudPublicId, invalidate: "true" }); const data = await request("image/destroy", { body: form, cloudName: asset.cloudName }); if (!data || !["ok", "not found"].includes(data.result)) { const e = httpError(502, "Cloud deletion needs reconciliation"); e.uncertain = true; throw e; } return data; }
module.exports = { configuration, secureCloudUrl, upload, inspect, destroy };

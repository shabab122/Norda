const StoreSettings = require("../models/StoreSettings");
const store = require("../config/store");
const httpError = require("../utils/httpError");
const { querySession } = require("./databaseUnit");
const { withOperationLock } = require("./operationLock");

const text = (value, max, label) => {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw httpError(400, "Invalid " + label);
  return value.trim();
};
const amount = (value, label, max = 10000000) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw httpError(400, label + " must be a non-negative amount with at most two decimals");
  return value;
};
const safeLink = (value, image = false) => {
  const link = text(value, 500, "link");
  if (!link) return "";
  if (/[\\\s<>"']/.test(link)) throw httpError(400, "Use a valid link without spaces");
  if (link.startsWith("/") && !link.startsWith("//") && !/%(?:2f|5c)/i.test(link)) {
    if (image && (!/^\/(?:uploads|assets)\/[a-zA-Z0-9_./-]+$/.test(link) || link.includes(".."))) throw httpError(400, "Use an uploaded or asset image");
    return link;
  }
  let url; try { url = new URL(link); } catch { throw httpError(400, "Use a local /path or HTTPS link"); }
  if ((url.protocol !== "https:" && !(image && process.env.NODE_ENV !== "production" && url.protocol === "http:")) || url.username || url.password) throw httpError(400, "Use an HTTPS link without embedded credentials");
  return url.href;
};
const defaults = () => ({
  returnWindowDays: 30, exchangeEnabled: true,
  revision: 0, currency: store.currency, freeShippingThreshold: store.freeShippingThreshold, flatShippingFee: store.flatShippingFee,
  supportEmail: "", supportPhone: "", address: "Dhaka, Bangladesh", supportHours: "",
  announcement: { visible: false, text: "", url: "" },
  hero: { visible: true, eyebrow: "The everyday edit", title: "Find your next everyday favourite.", description: "A considered collection for the way you live. Discover useful things, clear prices and a little everyday inspiration.", buttonLabel: "Shop the collection", buttonUrl: "/products.html", imageUrl: "/assets/norda-hero-v2.png" },
  faq: [], policies: { delivery: "", returns: "", privacy: "", terms: "" },
});
const getSettings = async (session = null) => {
  const saved = await querySession(StoreSettings.findById("store").lean(), session);
  const base = defaults();
  if (!saved) return base;
  return { ...base, revision: saved.revision || 0,
    ...Object.fromEntries(["supportEmail", "supportPhone", "address", "supportHours", "freeShippingThreshold", "flatShippingFee", "returnWindowDays", "exchangeEnabled"].filter((key) => saved[key] !== undefined).map((key) => [key, saved[key]])),
    announcement: { ...base.announcement, ...saved.announcement }, hero: { ...base.hero, ...saved.hero },
    faq: saved.faq || [], policies: { ...base.policies, ...saved.policies },
  };
};
const normalize = (body, current) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "Invalid store settings");
  if (!Number.isSafeInteger(body.revision) || body.revision !== current.revision) throw httpError(409, "Store settings changed. Reload before saving.");
  const out = {};
  if (body.returnWindowDays !== undefined) { if (!Number.isSafeInteger(body.returnWindowDays) || body.returnWindowDays < 0 || body.returnWindowDays > 365) throw httpError(400, "Return window must be 0 to 365 whole days"); out.returnWindowDays = body.returnWindowDays; }
  if (body.exchangeEnabled !== undefined) { if (typeof body.exchangeEnabled !== "boolean") throw httpError(400, "Exchange setting must be true or false"); out.exchangeEnabled = body.exchangeEnabled; }
  for (const [key, max] of [["supportEmail", 254], ["supportPhone", 40], ["address", 500], ["supportHours", 160]]) if (body[key] !== undefined) out[key] = text(body[key], max, key);
  if (out.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.supportEmail)) throw httpError(400, "Use a valid support email");
  for (const key of ["freeShippingThreshold", "flatShippingFee"]) if (body[key] !== undefined) out[key] = amount(body[key], key);
  for (const key of ["hero", "announcement"]) if (body[key] !== undefined) {
    const row = body[key]; if (!row || typeof row !== "object" || Array.isArray(row)) throw httpError(400, "Invalid " + key);
    out[key] = { ...current[key] };
    const fields = key === "hero" ? { eyebrow: 80, title: 160, description: 600, buttonLabel: 60 } : { text: 180 };
    for (const [field, max] of Object.entries(fields)) if (row[field] !== undefined) out[key][field] = text(row[field], max, field);
    for (const field of key === "hero" ? ["buttonUrl", "imageUrl"] : ["url"]) if (row[field] !== undefined) out[key][field] = safeLink(row[field], field === "imageUrl");
    if (row.visible !== undefined) { if (typeof row.visible !== "boolean") throw httpError(400, "Visibility must be true or false"); out[key].visible = row.visible; }
    if (out[key].visible && (key === "hero" ? !out[key].title || !out[key].buttonLabel || !out[key].buttonUrl || !out[key].imageUrl : !out[key].text)) throw httpError(400, "Complete the visible " + key + " content");
  }
  if (body.faq !== undefined) {
    if (!Array.isArray(body.faq) || body.faq.length > 20) throw httpError(400, "Use up to 20 FAQ entries");
    out.faq = body.faq.map((row) => { const question = text(row?.question, 180, "FAQ question"), answer = text(row?.answer, 2000, "FAQ answer"); if (!question || !answer) throw httpError(400, "Complete each FAQ question and answer"); return { question, answer }; });
  }
  if (body.policies !== undefined) {
    if (!body.policies || typeof body.policies !== "object" || Array.isArray(body.policies)) throw httpError(400, "Invalid policies");
    out.policies = { ...current.policies };
    for (const key of ["delivery", "returns", "privacy", "terms"]) if (body.policies[key] !== undefined) out.policies[key] = text(body.policies[key], 12000, key + " policy");
  }
  return out;
};
const saveSettings = (body, userId) => withOperationLock("store-settings", async () => {
  const current = await getSettings(); const fields = normalize(body, current);
  const saved = await StoreSettings.findById("store");
  if (!saved) await StoreSettings.create({ _id: "store", ...defaults(), ...fields, revision: 1, updatedBy: userId });
  else if (!await StoreSettings.findOneAndUpdate({ _id: "store", revision: current.revision }, { $set: { ...fields, updatedBy: userId }, $inc: { revision: 1 } }, { new: true, runValidators: true })) throw httpError(409, "Store settings changed. Reload before saving.");
  return getSettings();
});
module.exports = { amount, text, safeLink, defaults, getSettings, saveSettings, normalize };

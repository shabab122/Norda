const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const InventoryImport = require("../models/InventoryImport");
const httpError = require("../utils/httpError");
const { rowsToCsv } = require("../utils/csv");
const { pagination, escapeRegExp } = require("../utils/validation");
const { withOperationLock } = require("./operationLock");

const columns = ["productId", "variantId", "sku", "productName", "size", "color", "stock", "lowStockThreshold", "expectedStock", "inventoryVersion", "active"];
const MAX_ROWS = 500;
const whole = (v) => typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && Number.isSafeInteger(Number(v));
const threshold = (v) => v ?? 5;
const rowsFor = (product) => (product.variants?.length ? product.variants : [product]).map((item) => ({
  productId: String(product._id), variantId: product.variants?.length ? String(item._id) : "", sku: product.variants?.length ? item.sku : "",
  productName: product.name, size: item.size || "", color: item.color || "", stock: item.stock,
  lowStockThreshold: threshold(item.lowStockThreshold), expectedStock: item.stock, inventoryVersion: product.inventoryVersion || 0,
  active: !product.isArchived && item.isActive !== false, lowStock: !product.isArchived && item.isActive !== false && item.stock <= threshold(item.lowStockThreshold),
}));
const products = async (query = {}) => {
  const filter = { isArchived: { $ne: true } };
  if (query.keyword) { if (typeof query.keyword !== "string" || query.keyword.length > 80) throw httpError(400, "Use a search up to 80 characters"); const value = escapeRegExp(query.keyword.trim()); filter.$or = ["name", "variants.sku"].map((field) => ({ [field]: { $regex: value, $options: "i" } })); }
  // Bounded stock tools deliberately refuse a silently truncated export.
  const count = await Product.countDocuments(filter);
  if (count > 5000) throw httpError(400, "Narrow the product/SKU search before opening inventory (maximum 5,000 products)");
  return Product.find(filter).sort({ name: 1, _id: 1 }).limit(5000).lean();
};
const allRows = async (query) => (await products(query)).flatMap(rowsFor);
const list = async (query) => {
  const rows = await allRows(query), lowStockCount = rows.filter((row) => row.lowStock).length;
  const filtered = query.low === "true" ? rows.filter((row) => row.lowStock) : rows;
  const { page, limit } = pagination(query, 25);
  return { items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length, page, pages: Math.ceil(filtered.length / limit) || 1, lowStockCount, totalOptions: rows.length };
};
const exportCsv = async (query) => {
  let rows = await allRows(query); if (query.low === "true") rows = rows.filter((row) => row.lowStock);
  if (rows.length > MAX_ROWS) throw httpError(400, "Narrow the search to export up to 500 stock rows per file");
  return "\uFEFF" + rowsToCsv(columns.map((key) => ({ key, label: key })), rows);
};
// Strict RFC 4180 parser: commas/newlines/escaped quotes are allowed only
// inside quoted cells. Invalid files fail before any inventory write.
const parseCsv = (input) => {
  if (typeof input !== "string" || !input.trim() || Buffer.byteLength(input) > 700000 || input.includes("\0")) throw httpError(400, "Choose a UTF-8 inventory CSV up to 700 KB");
  const csv = input.replace(/^\uFEFF/, ""); const records = []; let row = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) { if (c === '"') { if (csv[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; continue; }
    if (closed && ![",", "\r", "\n"].includes(c)) throw httpError(400, "Unexpected text after a quoted CSV cell");
    if (c === '"') { if (cell || closed) throw httpError(400, "Invalid quote in CSV"); quoted = true; }
    else if (c === ",") { row.push(cell); cell = ""; closed = false; }
    else if (c === "\r" || c === "\n") { if (c === "\r" && csv[i + 1] === "\n") i++; row.push(cell); if (row.some((v) => v !== "")) records.push(row); row = []; cell = ""; closed = false; if (records.length > MAX_ROWS + 1) throw httpError(400, "Import up to 500 stock rows per file"); }
    else cell += c;
  }
  if (quoted) throw httpError(400, "Unclosed quoted CSV cell");
  row.push(cell); if (row.some((v) => v !== "")) records.push(row);
  if (records.length < 2 || records.length > MAX_ROWS + 1) throw httpError(400, "Use a header and 1–500 stock rows");
  const header = records.shift();
  if (header.length !== columns.length || header.some((v, i) => v !== columns[i])) throw httpError(400, "Keep the exact header from the inventory export");
  const seen = new Set();
  return records.map((values, index) => {
    if (values.length !== columns.length) throw httpError(400, "Wrong column count at CSV row " + (index + 2));
    const row = Object.fromEntries(header.map((key, i) => [key, values[i]]));
    if (!/^[a-f\d]{24}$/i.test(row.productId) || (row.variantId && !/^[a-f\d]{24}$/i.test(row.variantId))) throw httpError(400, "Invalid identifier at CSV row " + (index + 2));
    for (const field of ["stock", "expectedStock", "lowStockThreshold", "inventoryVersion"]) if (!whole(row[field])) throw httpError(400, "Use non-negative whole numbers for " + field + " at CSV row " + (index + 2));
    if (Number(row.lowStockThreshold) > 1000000) throw httpError(400, "Low-stock threshold is too large");
    const key = row.productId.toLowerCase() + ":" + row.variantId.toLowerCase(); if (seen.has(key)) throw httpError(400, "Duplicate stock row at CSV row " + (index + 2)); seen.add(key);
    return { ...row, productId: row.productId.toLowerCase(), variantId: row.variantId.toLowerCase(), stock: Number(row.stock), expectedStock: Number(row.expectedStock), lowStockThreshold: Number(row.lowStockThreshold), inventoryVersion: Number(row.inventoryVersion) };
  });
};
const grouped = (rows) => [...new Set(rows.map((r) => r.productId))].map((productId) => ({ productId, name: rows.find((r) => r.productId === productId).productName, rows: rows.filter((r) => r.productId === productId), status: "pending", message: "" }));
const changesFor = (product, rows) => {
  if (!product || product.isArchived) throw httpError(409, "Product is unavailable");
  if (rows.some((r) => r.inventoryVersion !== (product.inventoryVersion || 0))) throw httpError(409, "Product changed after export; re-export its stock rows");
  const variants = (product.variants || []).map((v) => v.toObject ? v.toObject() : { ...v });
  const fields = {};
  for (const row of rows) {
    const item = variants.length ? variants.find((v) => String(v._id) === row.variantId && v.sku === row.sku) : !row.variantId && !row.sku ? product : null;
    if (!item || item.stock !== row.expectedStock) throw httpError(409, "SKU or stock changed after export; re-export its stock rows");
    if (variants.length) { item.stock = row.stock; item.lowStockThreshold = row.lowStockThreshold; }
    else { fields.stock = row.stock; fields.lowStockThreshold = row.lowStockThreshold; }
  }
  if (variants.length) { const stock = variants.reduce((sum, v) => sum + v.stock, 0); if (!Number.isSafeInteger(stock)) throw httpError(400, "Combined variant stock is too large"); Object.assign(fields, { variants, stock }); }
  return fields;
};
const hash = (csv) => crypto.createHash("sha256").update(csv).digest("hex");
const preview = async (csv) => {
  const rows = parseCsv(csv), entries = grouped(rows), results = [];
  for (const entry of entries) {
    const product = await Product.findById(entry.productId);
    try { changesFor(product, entry.rows); results.push({ productId: entry.productId, name: product.name, rows: entry.rows.length, valid: true }); }
    catch (error) { if (error.statusCode !== 409 && error.statusCode !== 400) throw error; results.push({ productId: entry.productId, name: entry.name, rows: entry.rows.length, valid: false, message: error.message }); }
  }
  return { sourceHash: hash(csv), rowCount: rows.length, productCount: entries.length, valid: results.every((r) => r.valid), results, changes: rows.map((r) => ({ productId: r.productId, sku: r.sku, name: r.productName, from: r.expectedStock, to: r.stock, lowStockThreshold: r.lowStockThreshold })) };
};
const view = (job) => { const value = job.toObject ? job.toObject() : job; return { _id: value._id, requestKey: value.requestKey, sourceHash: value.sourceHash, status: value.status, entries: value.entries.map(({ productId, name, status, message, rows }) => ({ productId, name, status, message, rows: rows.length })), createdAt: value.createdAt }; };
const getImport = async (id) => { if (!mongoose.isObjectIdOrHexString(id)) throw httpError(400, "Invalid import identifier"); const job = await InventoryImport.findById(id); if (!job) throw httpError(404, "Inventory import not found"); return view(job); };
const applyImport = async ({ csv, requestKey, sourceHash }, userId) => {
  if (typeof requestKey !== "string" || !/^[a-zA-Z0-9_-]{12,80}$/.test(requestKey)) throw httpError(400, "A valid import request key is required");
  const rows = parseCsv(csv), source = hash(csv);
  if (sourceHash !== source) throw httpError(409, "The file changed after preview. Preview it again.");
  return withOperationLock("inventory-import:" + requestKey, async () => {
    let job = await InventoryImport.findOne({ requestKey });
    if (job && (job.sourceHash !== source || String(job.user) !== String(userId))) throw httpError(409, "This import key belongs to another file or administrator");
    if (!job) {
      const checked = await preview(csv); if (!checked.valid) throw httpError(409, "Some stock rows changed. Re-export and preview before importing.");
      job = await InventoryImport.create({ requestKey, sourceHash: source, user: userId, status: "processing", entries: grouped(rows) });
    }
    if (job.status === "completed") return view(job);
    const entries = job.entries.map((entry) => entry.toObject ? entry.toObject() : { ...entry });
    const persist = async () => { const saved = await InventoryImport.updateOne({ _id: job._id }, { $set: { entries } }); if (!saved.matchedCount) throw httpError(503, "Import history could not be saved. Review this import before another attempt."); };
    for (const entry of entries) {
      if (["applied", "conflict", "review"].includes(entry.status)) continue;
      await withOperationLock("product:" + entry.productId, async () => {
        const product = await Product.findById(entry.productId);
        if (entry.status === "applying") {
          entry.status = String(product?.lastInventoryImport || "") === String(job._id) ? "applied" : "review";
          entry.message = entry.status === "applied" ? "Recovered a completed stock update" : "An interrupted update needs comparison with a fresh export; it was not repeated";
          await persist(); return;
        }
        let fields;
        try { fields = changesFor(product, entry.rows); }
        catch (error) { if (![400, 409].includes(error.statusCode)) throw error; entry.status = "conflict"; entry.message = error.message; await persist(); return; }
        // Persist the intent first. A restart never blindly repeats an uncertain write.
        entry.status = "applying"; await persist();
        const filter = { _id: product._id, isArchived: { $ne: true }, stock: product.stock, $or: [{ inventoryVersion: product.inventoryVersion || 0 }, ...(product.inventoryVersion ? [] : [{ inventoryVersion: { $exists: false } }])] };
        try {
          const changed = await Product.findOneAndUpdate(filter, { $set: { ...fields, lastInventoryImport: job._id }, $inc: { inventoryVersion: 1 } }, { new: true, runValidators: true });
          entry.status = changed ? "applied" : "conflict"; entry.message = changed ? "Stock and alert thresholds updated" : "Stock changed during import; re-export this product";
        } catch { const fresh = await Product.findById(entry.productId); entry.status = String(fresh?.lastInventoryImport || "") === String(job._id) ? "applied" : "review"; entry.message = entry.status === "applied" ? "Stock update recovered" : "Stock write result is uncertain; compare a fresh export before another import"; }
        await persist();
      });
    }
    await InventoryImport.updateOne({ _id: job._id }, { $set: { status: "completed", entries } });
    return view(await InventoryImport.findById(job._id));
  });
};
module.exports = { columns, parseCsv, rowsFor, changesFor, list, exportCsv, preview, applyImport, getImport };

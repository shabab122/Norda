const crypto = require("node:crypto"), Product = require("../models/Product"), Import = require("../models/CatalogImport");
const parseCsv = require("../utils/readCsv"), { requestKey } = require("./orderOperationStore"), { withOperationLock } = require("./operationLock"), { withDatabaseUnit, insertDocument } = require("./databaseUnit");
const httpError = require("../utils/httpError"), { rowsToCsv } = require("../utils/csv");
const columns = ["productKey", "name", "description", "categoryId", "brandId", "price", "discountPrice", "stock", "sku", "size", "color", "images"];
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const number = (v, whole = false) => { if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(v || "")) throw httpError(400, "CSV prices and quantities must be non-negative numbers"); const n = Number(v); if (!Number.isSafeInteger(Math.round(n * 100)) || (whole && !Number.isSafeInteger(n))) throw httpError(400, "CSV stock must be whole and prices use up to two decimals"); return n; };
async function build(csv) {
  if (typeof csv !== "string" || Buffer.byteLength(csv) > 300000) throw httpError(400, "Use a UTF-8 catalog CSV up to 300 KB");
  const rows = parseCsv(csv); if (JSON.stringify(rows.shift()) !== JSON.stringify(columns) || !rows.length || rows.length > 200) throw httpError(400, "Use the exact catalog template with 1–200 rows");
  const grouped = new Map(), globalSkus = new Set();
  for (const row of rows) {
    if (row.length !== columns.length) throw httpError(400, "Every CSV row needs the template columns"); const x = Object.fromEntries(columns.map((c, i) => [c, row[i]]));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x.productKey) || x.productKey.length > 120) throw httpError(400, "Product keys must be lowercase URL slugs");
    if (x.sku && globalSkus.has(x.sku.toUpperCase())) throw httpError(400, "Duplicate SKU in this CSV"); if (x.sku) globalSkus.add(x.sku.toUpperCase());
    const g = grouped.get(x.productKey) || []; g.push(x); grouped.set(x.productKey, g);
  }
  if (grouped.size > 50) throw httpError(400, "Create up to 50 products per import");
  const products = [];
  for (const [slug, rows] of grouped) {
    if (await Product.exists({ slug })) throw httpError(409, "A product key already exists: " + slug);
    const first = rows[0]; if (rows.some(x => ["name", "description", "categoryId", "brandId"].some(k => x[k] !== first[k]))) throw httpError(400, "Shared product fields must match for every SKU row");
    if (rows.length > 1 && rows.some(x => !x.sku)) throw httpError(400, "Every option row requires a SKU");
    const images = x => x.images ? x.images.split("|") : [];
    const body = { name: first.name, description: first.description, category: first.categoryId, brandRef: first.brandId || null, price: number(first.price), discountPrice: number(first.discountPrice || "0"), stock: number(first.stock, true), images: images(first) };
    if (body.images.length > 6 || body.images.some(v => !require("../utils/validation").cleanAssetUrl(v))) throw httpError(400, "Use up to six valid image URLs separated by pipes");
    const payload = await require("../controllers/productController").parseProductPayload(body); payload.slug = slug;
    if (first.sku) { const variants = await require("./variantService").parseVariants(rows.map(x => ({ sku: x.sku, size: x.size, color: x.color, price: number(x.price), discountPrice: number(x.discountPrice || "0"), stock: number(x.stock, true), images: images(x) }))); Object.assign(payload, require("./variantService").variantSummary(variants), { variants }); }
    else if (first.size || first.color) throw httpError(400, "Size/color rows require a SKU");
    products.push(payload);
  }
  for (const p of products) await require("./mediaService").assertUsableReferences(p);
  return products;
}
async function preview(csv) { const products = await build(csv); return { sourceHash: hash(csv), products: products.map(p => ({ slug: p.slug, name: p.name, variants: p.variants?.length || 0, stock: p.stock, price: p.price })) }; }
async function apply(user, body) { const key = requestKey(body.requestKey), sourceHash = hash(typeof body.csv === "string" ? body.csv : ""); if (body.sourceHash !== sourceHash) throw httpError(409, "Preview this exact CSV before importing"); return withOperationLock("media-references", () => withOperationLock("catalog-create", async () => {
  const old = await Import.findOne({ requestKey: key }); if (old) { if (old.sourceHash !== sourceHash) throw httpError(409, "This import key belongs to another CSV"); return old; }
  const products = await build(body.csv);
  return withDatabaseUnit(async unit => { const created = []; for (const p of products) { const product = await insertDocument(Product, p, unit.session); unit.compensate(() => Product.deleteOne({ _id: product._id })); created.push({ product: product._id, slug: p.slug, name: p.name }); } const job = await insertDocument(Import, { requestKey: key, sourceHash, user: user._id, status: "completed", products: created }, unit.session); unit.compensate(() => Import.deleteOne({ _id: job._id })); return job; });
})); }
module.exports = { columns, build, preview, apply, template: () => rowsToCsv(columns.map(c => ({ key: c, label: c })), []) };

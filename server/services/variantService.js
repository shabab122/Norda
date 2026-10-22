const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");
const httpError = require("../utils/httpError");
const { cleanText, cleanAssetUrl, effectivePrice } = require("../utils/validation");

const parseVariants = async (input, current) => {
  if (input === undefined) return null;
  if (!Array.isArray(input) || input.length > 50) throw httpError(400, "Use up to 50 size/color variants");
  const old = current?.variants || [];
  if (old.length && !input.length) throw httpError(409, "Keep existing variants for order history; deactivate options instead");
  if (!old.length && input.length && current && await Order.exists({ "items.product": current._id })) throw httpError(409, "This product already has order history. Create a new variant product to preserve its original inventory.");
  if (!old.length && input.length && current && await require("../models/WarehouseStock").exists({ product: current._id, variantKey: "base", quantity: { $gt: 0 } })) throw httpError(409, "Transfer or reconcile base warehouse stock before creating variant inventory");
  const ids = new Set(), skus = new Set(), combinations = new Set();
  const variants = input.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw httpError(400, "Invalid variant");
    if (row._id !== undefined && !mongoose.isObjectIdOrHexString(row._id)) throw httpError(400, "Invalid variant identifier");
    const previous = row._id && old.find((v) => String(v._id) === String(row._id));
    if (row._id && !previous) throw httpError(400, "A variant identifier must belong to this product");
    const _id = previous?._id || new mongoose.Types.ObjectId();
    if (ids.has(String(_id))) throw httpError(400, "A variant was repeated"); ids.add(String(_id));
    const sku = cleanText(row.sku, 64).toUpperCase(), size = cleanText(row.size, 40), color = cleanText(row.color, 40);
    if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(sku) || (!size && !color)) throw httpError(400, "Each variant needs a unique SKU (3–64 letters/numbers/_/-) and a size or color");
    if (previous && (sku !== previous.sku || size !== (previous.size || "") || color !== (previous.color || ""))) throw httpError(409, "Existing SKU, size and color identify historical inventory. Add a new option and retire the old one instead.");
    const combination = JSON.stringify([size.toLowerCase(), color.toLowerCase()]);
    if (skus.has(sku) || combinations.has(combination)) throw httpError(400, "SKU and size/color combinations must be unique"); skus.add(sku); combinations.add(combination);
    const price = Number(row.price), discountPrice = Number(row.discountPrice || 0), stock = row.stock === undefined ? previous?.stock : Number(row.stock);
    if (![price, discountPrice].every((v) => Number.isFinite(v) && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.00001) || price <= 0 || discountPrice < 0 || (discountPrice && discountPrice >= price) || !Number.isSafeInteger(stock) || stock < 0) throw httpError(400, "Variant prices need at most two decimals and stock must be a non-negative whole number");
    if (previous && row.stock !== undefined && Number(row.expectedStock) !== previous.stock) throw httpError(409, "Variant stock changed. Reopen the product before editing inventory.");
    if (row.isActive !== undefined && typeof row.isActive !== "boolean") throw httpError(400, "Variant availability must be true or false");
    if (row.images !== undefined && (!Array.isArray(row.images) || row.images.length > 6)) throw httpError(400, "Each variant supports up to six images");
    const images = row.images === undefined ? [...(previous?.images || [])] : row.images.map((url) => cleanAssetUrl(url));
    if (images.some((url) => !url)) throw httpError(400, "Use valid upload or HTTP image URLs");
    const lowStockThreshold = row.lowStockThreshold ?? previous?.lowStockThreshold ?? 5;
    if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0 || lowStockThreshold > 1000000) throw httpError(400, "Low-stock threshold must be a whole number from 0 to 1,000,000");
    return { _id, sku, size, color, price, discountPrice, stock, images, lowStockThreshold, isActive: row.isActive ?? previous?.isActive ?? true };
  });
  if (old.some((v) => !ids.has(String(v._id)))) throw httpError(409, "Existing variants cannot be deleted. Deactivate them to preserve inventory and history.");
  if (variants.length && await Product.exists({ ...(current ? { _id: { $ne: current._id } } : {}), "variants.sku": { $in: [...skus] } })) throw httpError(409, "A SKU is already used by another product");
  return variants;
};
const variantSummary = (variants) => {
  const active = variants.filter((v) => v.isActive !== false);
  const cheapest = [...active].sort((a, b) => effectivePrice(a) - effectivePrice(b))[0] || variants[0];
  const stock = variants.reduce((sum, v) => sum + v.stock, 0);
  if (!Number.isSafeInteger(stock)) throw httpError(400, "Combined variant stock is outside the supported range");
  return { stock, price: cheapest.price, discountPrice: cheapest.discountPrice };
};
const publicProduct = (value) => {
  const product = value.toObject ? value.toObject() : { ...value };
  if (product.variants?.length) {
    product.hasVariants = true;
    product.variants = product.variants.filter((v) => v.isActive !== false);
    product.stock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  }
  if (product.isArchived) { product.stock = 0; product.variants = (product.variants || []).map((v) => ({ ...v, stock: 0 })); }
  delete product.inventoryVersion;
  delete product.lastInventoryImport;
  return product;
};
module.exports = { parseVariants, variantSummary, publicProduct };

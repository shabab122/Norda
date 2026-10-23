const mongoose = require("mongoose");
const Product = require("../models/Product");
const httpError = require("../utils/httpError");
const { effectivePrice } = require("../utils/validation");
const { writeOptions } = require("./databaseUnit");

const selection = (product, variantId) => {
  if (!product || product.isArchived) throw httpError(409, "This product is unavailable");
  const variants = product.variants || [];
  if (!variants.length) {
    if (variantId) throw httpError(409, "This product no longer has that option");
    return { price: effectivePrice(product), stock: product.stock, image: product.images?.[0] || "" };
  }
  if (!variantId || !mongoose.isObjectIdOrHexString(variantId)) throw httpError(409, "Choose a size or color before adding this product");
  const variant = variants.find((v) => String(v._id) === String(variantId));
  if (!variant || variant.isActive === false) throw httpError(409, "This size or color is unavailable. Choose another option.");
  return { variantId: variant._id, sku: variant.sku, size: variant.size || "", color: variant.color || "", price: effectivePrice(variant), stock: variant.stock, image: variant.images?.[0] || product.images?.[0] || "" };
};

// Both the variant and product total change in the same atomic document write.
// Base items must never consume an unselected variant after a catalog edit.
const stockWrite = (item, delta, reserve = false) => {
  const filter = { _id: item.product };
  const increment = { stock: delta, inventoryVersion: 1 };
  if (item.variantId) {
    filter.variants = { $elemMatch: { _id: item.variantId, ...(reserve ? { isActive: { $ne: false }, stock: { $gte: item.quantity } } : {}) } };
    increment["variants.$.stock"] = delta;
  } else if (reserve) filter.$or = [{ variants: { $exists: false } }, { variants: { $size: 0 } }];
  if (reserve) { filter.isArchived = { $ne: true }; filter.stock = { $gte: item.quantity }; }
  return { filter, update: { $inc: increment } };
};
const reserveItem = async (item, unit) => {
  if (item.fulfillmentAllocations?.length) return require("./fulfillmentService").reservePlanned(item, unit);
  const { filter, update } = stockWrite(item, -item.quantity, true);
  const result = await Product.findOneAndUpdate(filter, update, writeOptions(unit.session, { new: true }));
  if (!result) throw httpError(409, "Not enough stock for " + item.name + (item.sku ? " (" + item.sku + ")" : ""));
  const undo = stockWrite(item, item.quantity);
  unit.compensate(() => Product.updateOne(undo.filter, undo.update));
  return result;
};
const restoreItem = async (item, unit, strict = true) => {
  if (item.fulfillmentAllocations?.length) return require("./fulfillmentService").restore(item, unit, strict);
  const { filter, update } = stockWrite(item, item.quantity);
  const result = await Product.updateOne(filter, update, writeOptions(unit.session));
  if (!result.matchedCount) { if (strict) throw httpError(409, "A historical product or variant is missing. Inventory needs store review."); return false; }
  const undo = stockWrite(item, -item.quantity);
  unit.compensate(() => Product.updateOne(undo.filter, undo.update));
  return true;
};
module.exports = { selection, stockWrite, reserveItem, restoreItem };

const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const WishlistItem = require("../models/WishlistItem");
const { selection } = require("../services/inventoryService");
const { publicProduct } = require("../services/variantService");
const { calculateTotals } = require("../services/orderService");
const settings = require("../services/storeSettingsService");
const coupons = require("../services/couponService");
const inventory = require("../services/inventoryToolsService");
const { withOperationLock } = require("../services/operationLock");
const { pagination } = require("../utils/validation");
const httpError = require("../utils/httpError");

const handle = (work) => async (req, res, next) => { try { await work(req, res); } catch (error) { next(error); } };
const validId = (id) => { if (!mongoose.isObjectIdOrHexString(id)) throw httpError(400, "Invalid product identifier"); return id; };
const getConfig = handle(async (req, res) => res.json(await settings.getSettings()));
const saveConfig = handle(async (req, res) => res.json(await settings.saveSettings(req.body, req.user._id)));
const listCoupons = handle(async (req, res) => {
  const { page, limit } = pagination(req.query, 20);
  const [items, total] = await Promise.all([Coupon.find({}).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), Coupon.countDocuments({})]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
});
const publicCoupons = handle(async (req, res) => {
  const now = new Date();
  const rows = await Coupon.find({ isActive: true, isPublic: true, startsAt: { $lte: now }, endsAt: { $gt: now } }).sort({ endsAt: 1 }).limit(100).lean();
  res.json(rows.filter((row) => !row.usageLimit || row.usedCount < row.usageLimit).map((row) => Object.fromEntries(["code", "title", "type", "value", "minSubtotal", "maxDiscount", "startsAt", "endsAt", "perUserLimit"].map((key) => [key, row[key]]))));
});
const saveCoupon = handle(async (req, res) => res.status(req.params.id ? 200 : 201).json(await coupons.saveCoupon(req.params.id, req.body)));
const previewCoupon = handle(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate("items.product");
  if (!cart?.items.length) throw httpError(400, "Your cart is empty");
  const items = cart.items.map((item) => { const selected = selection(item.product, item.variantId); if (item.quantity > selected.stock) throw httpError(409, "Review unavailable quantities in your cart"); return { price: selected.price, quantity: item.quantity }; });
  const config = await settings.getSettings(), subtotal = calculateTotals(items, config).subtotal;
  const quote = await coupons.quoteCoupon(req.body.code, subtotal, req.user._id);
  res.json({ ...quote, ...calculateTotals(items, { ...config, discountAmount: quote.discountAmount }), configRevision: config.revision, cartSignature: JSON.stringify(cart.items.map((item) => [String(item.product._id), String(item.variantId || ""), item.quantity, selection(item.product, item.variantId).price])) });
});
const wishlistIds = handle(async (req, res) => { const rows = await WishlistItem.find({ user: req.user._id }).select("product").limit(200).lean(); res.json(rows.map((row) => String(row.product))); });
const wishlist = handle(async (req, res) => {
  const { page, limit } = pagination(req.query, 12);
  const filter = { user: req.user._id };
  const [rows, total] = await Promise.all([WishlistItem.find(filter).populate("product").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), WishlistItem.countDocuments(filter)]);
  res.json({ items: rows.map((row) => ({ _id: row._id, productId: String(row.product?._id || ""), product: row.product ? publicProduct(row.product) : null, unavailable: !row.product || Boolean(row.product.isArchived), createdAt: row.createdAt })), total, page, pages: Math.ceil(total / limit) || 1 });
});
const saveWish = handle(async (req, res) => {
  const productId = validId(req.params.id);
  await withOperationLock("wishlist:" + req.user._id, async () => {
    const product = await Product.findById(productId);
    if (!product || product.isArchived) throw httpError(404, "This product is no longer available");
    const filter = { user: req.user._id, product: productId };
    if (await WishlistItem.exists(filter)) return;
    if (await WishlistItem.countDocuments({ user: req.user._id }) >= 200) throw httpError(409, "Your wishlist holds up to 200 products. Remove an item before adding another.");
    await WishlistItem.create(filter);
  });
  res.json({ saved: true, productId });
});
const removeWish = handle(async (req, res) => { await WishlistItem.deleteOne({ user: req.user._id, product: validId(req.params.id) }); res.json({ saved: false }); });
const removeWishEntry = handle(async (req, res) => { validId(req.params.id); await WishlistItem.deleteOne({ _id: req.params.id, user: req.user._id }); res.json({ removed: true }); });
const listInventory = handle(async (req, res) => res.json(await inventory.list(req.query)));
const exportInventory = handle(async (req, res) => { const csv = await inventory.exportCsv(req.query); res.setHeader("Content-Disposition", 'attachment; filename="norda-inventory.csv"'); res.type("text/csv").send(csv); });
const previewInventory = handle(async (req, res) => res.json(await inventory.preview(req.body.csv)));
const applyInventory = handle(async (req, res) => res.json(await inventory.applyImport(req.body, req.user._id)));
const getImport = handle(async (req, res) => res.json(await inventory.getImport(req.params.id)));
module.exports = { getConfig, saveConfig, listCoupons, publicCoupons, saveCoupon, previewCoupon, wishlist, wishlistIds, saveWish, removeWish, removeWishEntry, listInventory, exportInventory, previewInventory, applyInventory, getImport };

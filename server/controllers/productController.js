const { parseVariants, variantSummary, publicProduct } = require("../services/variantService");
const mongoose = require("mongoose");
const httpError = require("../utils/httpError");
const { withOperationLock } = require("../services/operationLock");
const Brand = require("../models/Brand");
const Category = require("../models/Category");
const Product = require("../models/Product");
const { slugify } = require("./categoryController");
const { cleanAssetUrl, cleanText, escapeRegExp, pagination } = require("../utils/validation");

const parseProductPayload = async (body, currentProduct = null) => {
  const name = body.name !== undefined ? cleanText(body.name, 140) : currentProduct?.name;
  const description =
    body.description !== undefined ? cleanText(body.description, 3000) : currentProduct?.description;
  const price = body.price !== undefined ? Number(body.price) : currentProduct?.price;
  const discountPrice =
    body.discountPrice !== undefined ? Number(body.discountPrice || 0) : currentProduct?.discountPrice ?? 0;
  const stock = body.stock !== undefined ? Number(body.stock) : currentProduct?.stock;
  const categoryId = body.category !== undefined ? body.category : currentProduct?.category;
  const brandId = body.brandRef !== undefined ? body.brandRef : currentProduct?.brandRef;

  if (!name || !categoryId || !Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(Math.round(price * 100))) {
    const error = new Error("Name, category and a price greater than zero are required");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isSafeInteger(stock) || stock < 0) {
    const error = new Error("Stock must be a whole number of zero or more");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(discountPrice) || discountPrice < 0 || discountPrice >= price) {
    if (discountPrice !== 0) {
      const error = new Error("Discount price must be zero or lower than the regular price");
      error.statusCode = 400;
      throw error;
    }
  }

  const category = await Category.findById(categoryId);
  if (!category) {
    const error = new Error("Selected category does not exist");
    error.statusCode = 400;
    throw error;
  }

  let brand = null;
  if (brandId) {
    brand = await Brand.findById(brandId);
    if (!brand) {
      const error = new Error("Selected brand does not exist");
      error.statusCode = 400;
      throw error;
    }
  }

  const lowStockThreshold = body.lowStockThreshold ?? currentProduct?.lowStockThreshold ?? 5;
  if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0 || lowStockThreshold > 1000000) throw httpError(400, "Low-stock threshold must be a whole number from 0 to 1,000,000");
  return {
    lowStockThreshold, name,
    description,
    price,
    discountPrice,
    stock,
    category: category._id,
    brandRef: brand?._id || null,
    brand: brand?.name || cleanText(body.brand, 80) || currentProduct?.brand || "Generic",
    images: Array.isArray(body.images)
      ? body.images.map(cleanAssetUrl).filter(Boolean).slice(0, 6)
      : currentProduct?.images || [],
    isFeatured: body.isFeatured !== undefined ? body.isFeatured === true : Boolean(currentProduct?.isFeatured),
    isArchived: body.isArchived !== undefined ? body.isArchived === true : Boolean(currentProduct?.isArchived),
  };
};

const uniqueSlug = async (name, excludedId = null) => {
  const base = slugify(name) || "product";
  let candidate = base;
  let suffix = 1;
  const filter = () => ({
    slug: candidate,
    ...(excludedId ? { _id: { $ne: excludedId } } : {}),
  });
  while (await Product.exists(filter())) {
    candidate = base + "-" + suffix;
    suffix += 1;
  }
  return candidate;
};

const createProduct = async (req, res, next) => {
  try {
    const payload = await parseProductPayload(req.body);
    const variants = await parseVariants(req.body.variants);
    if (variants?.length) Object.assign(payload, variantSummary(variants), { variants });
    payload.slug = await uniqueSlug(payload.name);
    const product = await Product.create(payload);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
};

const effectivePriceExpression = { $cond: [
  { $and: [{ $gt: ["$discountPrice", 0] }, { $lt: ["$discountPrice", "$price"] }] }, "$discountPrice", "$price",
] };
const listProducts = async (req, res, next, management = false) => {
  try {
    const { category, brand, keyword, minPrice, maxPrice, featured, sort } = req.query;
    const filter = management && req.query.archived === "all" ? {} :
      { isArchived: management && req.query.archived === "true" ? true : { $ne: true } };
    for (const [key, value] of [["category", category], ["brandRef", brand]]) {
      if (!value) continue;
      if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw httpError(400, "Please select a valid category or brand");
      filter[key] = new mongoose.Types.ObjectId(value);
    }
    if (featured !== undefined && featured !== "") {
      if (!["true", "false"].includes(featured)) throw httpError(400, "Invalid featured filter");
      filter.isFeatured = featured === "true";
    }
    if (keyword) {
      const safeKeyword = escapeRegExp(cleanText(keyword, 80));
      filter.$or = ["name", "description", "brand", "variants.sku"].map((key) => ({ [key]: { $regex: safeKeyword, $options: "i" } }));
      const categories = await Category.find({ name: { $regex: safeKeyword, $options: "i" } }).select("_id");
      if (categories.length) filter.$or.push({ category: { $in: categories.map(item => item._id) } });
    }
    const priceMatch = {};
    if (minPrice !== undefined && minPrice !== "") {
      if (!Number.isFinite(Number(minPrice)) || Number(minPrice) < 0) throw httpError(400, "Minimum price must be zero or more");
      priceMatch.$gte = Number(minPrice);
    }
    if (maxPrice !== undefined && maxPrice !== "") {
      if (!Number.isFinite(Number(maxPrice)) || Number(maxPrice) < 0) throw httpError(400, "Maximum price must be zero or more");
      priceMatch.$lte = Number(maxPrice);
    }
    if (priceMatch.$gte !== undefined && priceMatch.$lte !== undefined && priceMatch.$gte > priceMatch.$lte) throw httpError(400, "Minimum price cannot exceed maximum price");
    const { page, limit } = pagination(req.query, 12);
    const sortOption = sort === "price_asc" ? { effectivePrice: 1, _id: 1 } :
      sort === "price_desc" ? { effectivePrice: -1, _id: 1 } :
      sort === "top_rated" ? { ratingAverage: -1, ratingCount: -1, _id: 1 } : { createdAt: -1, _id: -1 };
    const pipeline = [{ $match: filter }, { $addFields: { effectivePrice: effectivePriceExpression } }];
    if (Object.keys(priceMatch).length) pipeline.push({ $match: { effectivePrice: priceMatch } });
    pipeline.push({ $facet: {
      products: [{ $sort: sortOption }, { $skip: (page - 1) * limit }, { $limit: limit }],
      total: [{ $count: "count" }],
    } });
    const [result] = await Product.aggregate(pipeline);
    const products = await Product.populate(result.products, [
      { path: "category", select: "name slug" }, { path: "brandRef", select: "name slug logo" },
    ]);
    const total = result.total[0]?.count || 0;
    res.json({ products: management ? products : (await require("../services/fulfillmentService").enrich(products)).map(publicProduct), total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (error) { next(error); }
};
const getProducts = (req, res, next) => listProducts(req, res, next);
const getManagedProducts = (req, res, next) => listProducts(req, res, next, true);

const getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category", "name slug")
      .populate("brandRef", "name slug logo");
    if (!product) return res.status(404).json({ message: "Product not found" });
    const [available] = await require("../services/fulfillmentService").enrich([product]);
    const result = publicProduct(available);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getManagedProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).populate("category", "name slug").populate("brandRef", "name slug");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) { next(error); }
};

const updateProduct = async (req, res, next) => {
  try {
    const updated = await withOperationLock("product:" + req.params.id, async () => {
      const product = await Product.findById(req.params.id);
      if (!product) throw httpError(404, "Product not found");
      const payload = await parseProductPayload(req.body, product);
      const variants = await parseVariants(req.body.variants, product);
      if (product.variants?.length && ["stock", "price", "discountPrice"].some((field) => req.body[field] !== undefined) && variants === null) throw httpError(400, "Update price and stock on the individual variants");
      if (req.body.name !== undefined) payload.slug = await uniqueSlug(payload.name, product._id);
      // Only set fields intentionally edited by the form. In particular, an
      // unrelated product edit must not overwrite a concurrent stock change.
      const fields = {};
      for (const key of ["name", "description", "price", "discountPrice", "stock", "category", "images", "isFeatured", "isArchived", "lowStockThreshold"]) {
        if (req.body[key] !== undefined) fields[key] = payload[key];
      }
      if (req.body.brandRef !== undefined || req.body.brand !== undefined) { fields.brandRef = payload.brandRef; fields.brand = payload.brand; }
      if (payload.slug) fields.slug = payload.slug;
      if (variants !== null) { fields.variants = variants; if (variants.length) Object.assign(fields, variantSummary(variants)); }
      const filter = { _id: product._id };
      if (variants !== null) filter.$or = [{ inventoryVersion: product.inventoryVersion || 0 }, ...(product.inventoryVersion ? [] : [{ inventoryVersion: { $exists: false } }])];
      if (fields.stock !== undefined && req.body.expectedStock !== undefined) filter.stock = Number(req.body.expectedStock);
      const saved = await Product.findOneAndUpdate(filter, { $set: fields, $inc: { inventoryVersion: 1 } }, { new: true, runValidators: true });
      if (!saved) throw httpError(409, "Stock changed while you were editing. Reopen the product before updating inventory.");
      return saved;
    });
    res.json(updated);
  } catch (error) { next(error); }
};
const deleteProduct = async (req, res, next) => {
  try {
    const product = await withOperationLock("product:" + req.params.id, () => Product.findByIdAndUpdate(req.params.id, { $set: { isArchived: true, isFeatured: false } }, { new: true }));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product archived. Existing order history is preserved." });
  } catch (error) { next(error); }
};

module.exports = { parseProductPayload, createProduct, deleteProduct, getProduct, getManagedProduct, getManagedProducts, getProducts, updateProduct };

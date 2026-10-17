const Brand = require("../models/Brand");
const Category = require("../models/Category");
const Product = require("../models/Product");
const { slugify } = require("../controllers/categoryController");
const catalog = require("./catalog");

// Preserve merchant changes, purchased stock and existing order references.
async function seedCatalog() {
  const categories = {}; const brands = {};
  for (const item of catalog.categories) {
    const category = await Category.findOneAndUpdate({ slug: slugify(item.name) }, { $setOnInsert: { name: item.name, slug: slugify(item.name), image: item.image } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    if (!category.image || /^\/assets\/products\/[^/]+\.svg$/.test(category.image)) { category.image = item.image; await category.save(); }
    categories[item.name] = category;
  }
  for (const name of new Set(catalog.products.map((item) => item.brand))) {
    brands[name] = await Brand.findOneAndUpdate({ slug: slugify(name) }, { $setOnInsert: { name, slug: slugify(name), isActive: true } }, { new: true, upsert: true, setDefaultsOnInsert: true });
  }
  let created = 0; let refreshed = 0;
  for (const item of catalog.products) {
    const slug = slugify(item.name);
    const existing = await Product.findOne({ slug }) || await Product.findOne({ name: item.name });
    if (existing) {
      let changed = false;
      if (!existing.brandRef && existing.brand === item.brand) { existing.brandRef = brands[item.brand]._id; changed = true; }
      const oldSample = "/assets/products/" + item.imageKey + ".svg";
      if (!existing.images?.length || existing.images.every((image) => image === oldSample || image === "/assets/products/collection.svg")) { existing.images = item.images; changed = true; }
      if (changed) { await existing.save(); refreshed++; }
      continue;
    }
    const { category, imageKey, ...data } = item;
    await Product.create({ ...data, slug, category: categories[category]._id, brandRef: brands[item.brand]._id });
    created++;
  }
  return { message: "Demo catalog ready. Existing prices, stock, custom images and orders were preserved.", categories: catalog.categories.length, demoProducts: catalog.products.length, created, refreshed };
}
module.exports = { seedCatalog };

require("dotenv").config();

const mongoose = require("mongoose");
const Brand = require("../models/Brand");
const Category = require("../models/Category");
const Product = require("../models/Product");
const User = require("../models/User");
const connectDB = require("../config/db");
const { slugify } = require("../controllers/categoryController");

const seed = async () => {
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
    throw new Error("Set ADMIN_PASSWORD to at least 12 characters before running the seed");
  }
  await connectDB();

  const adminEmail = String(process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const existingAdmin = await User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await User.create({
      name: process.env.ADMIN_NAME || "Super Admin",
      email: adminEmail,
      password: process.env.ADMIN_PASSWORD,
      role: "admin",
    });
    console.log("Admin account created for " + adminEmail);
  } else {
    if (existingAdmin.role !== "admin") throw new Error("ADMIN_EMAIL belongs to a customer. Choose a different ADMIN_EMAIL; the customer role was not changed.");
    console.log("Admin account already exists; skipped.");
  }

  const categoryNames = ["Electronics", "Fashion", "Home & Kitchen", "Sports & Outdoors", "Books"];
  const categories = {};
  for (const name of categoryNames) {
    const category = await Category.findOneAndUpdate(
      { slug: slugify(name) },
      { $setOnInsert: { name, slug: slugify(name) } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    categories[name] = category;
  }

  const brandNames = [
    "SoundMax",
    "FitTrack",
    "UrbanWear",
    "StrideFit",
    "ChefPro",
    "HomeEase",
    "ZenFit",
    "IronCore",
    "TechPress",
    "Penbound",
  ];
  const brands = {};
  for (const name of brandNames) {
    const brand = await Brand.findOneAndUpdate(
      { slug: slugify(name) },
      { $setOnInsert: { name, slug: slugify(name), isActive: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    brands[name] = brand;
  }

  const imageNames = ["headphones", "watch", "jacket", "shoes", "cookware", "kettle", "yoga", "dumbbells", "clean-code", "mystery"];
  const products = [
    {
      name: "Wireless Bluetooth Headphones",
      category: "Electronics",
      price: 5200,
      discountPrice: 4490,
      stock: 40,
      brand: "SoundMax",
      isFeatured: true,
      description: "Comfortable over-ear wireless headphones with noise isolation and up to 30 hours of battery life.",
    },
    {
      name: "Smartwatch Fitness Tracker",
      category: "Electronics",
      price: 7850,
      discountPrice: 0,
      stock: 25,
      brand: "FitTrack",
      isFeatured: true,
      description: "Track steps, heart rate and sleep from a lightweight everyday smartwatch.",
    },
    {
      name: "Men's Casual Denim Jacket",
      category: "Fashion",
      price: 3900,
      discountPrice: 3290,
      stock: 30,
      brand: "UrbanWear",
      isFeatured: false,
      description: "A classic denim jacket made from durable, breathable cotton.",
    },
    {
      name: "Women's Running Shoes",
      category: "Fashion",
      price: 5600,
      discountPrice: 0,
      stock: 50,
      brand: "StrideFit",
      isFeatured: true,
      description: "Lightweight running shoes with responsive cushioning for daily training.",
    },
    {
      name: "Non-Stick Cookware Set",
      category: "Home & Kitchen",
      price: 9800,
      discountPrice: 8490,
      stock: 15,
      brand: "ChefPro",
      isFeatured: true,
      description: "A durable ten-piece cookware set with pans, pots and fitted lids.",
    },
    {
      name: "Electric Kettle 1.7L",
      category: "Home & Kitchen",
      price: 2600,
      discountPrice: 0,
      stock: 60,
      brand: "HomeEase",
      isFeatured: false,
      description: "A fast-boiling electric kettle with automatic shut-off protection.",
    },
    {
      name: "Yoga Mat with Carry Strap",
      category: "Sports & Outdoors",
      price: 2200,
      discountPrice: 1790,
      stock: 80,
      brand: "ZenFit",
      isFeatured: false,
      description: "A non-slip six-millimetre yoga mat with a convenient carry strap.",
    },
    {
      name: "Adjustable Dumbbell Set",
      category: "Sports & Outdoors",
      price: 12500,
      discountPrice: 0,
      stock: 10,
      brand: "IronCore",
      isFeatured: true,
      description: "Space-saving adjustable dumbbells for flexible strength training at home.",
    },
    {
      name: "The Art of Clean Code",
      category: "Books",
      price: 1850,
      discountPrice: 1490,
      stock: 100,
      brand: "TechPress",
      isFeatured: false,
      description: "A practical guide to writing software that is readable and maintainable.",
    },
    {
      name: "Mystery Island",
      category: "Books",
      price: 1200,
      discountPrice: 0,
      stock: 70,
      brand: "Penbound",
      isFeatured: false,
      description: "A tense mystery novel set on a remote island.",
    },
  ];

  for (const [index, item] of products.entries()) {
    const imageUrl = "/assets/products/" + imageNames[index] + ".svg";
    const existing = await Product.findOne({ name: item.name });
    if (existing) {
      let changed = false;
      if (!existing.brandRef) { existing.brandRef = brands[item.brand]._id; existing.brand = item.brand; changed = true; }
      if (!existing.images.length) { existing.images = [imageUrl]; changed = true; }
      if (changed) await existing.save();
      continue;
    }
    await Product.create({
      name: item.name,
      slug: slugify(item.name),
      description: item.description,
      price: item.price,
      discountPrice: item.discountPrice,
      stock: item.stock,
      category: categories[item.category]._id,
      brand: item.brand,
      brandRef: brands[item.brand]._id,
      images: [imageUrl],
      isFeatured: item.isFeatured,
    });
  }

  console.log("Categories, brands and sample products are ready.");
};

seed()
  .then(async () => {
    await mongoose.connection.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Seeding failed:", error.message);
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  });

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const uri = process.env.NORDA_TEST_MONGO_URI;

// Opt-in only. This always creates a new, random test database, and never
// drops the database named by the supplied connection URI.
test("Real MongoDB: checkout, effective-price catalog, invoice, cancellation and replay", { skip: !uri, timeout: 60000 }, async () => {
  const dbName = "norda_test_" + crypto.randomBytes(8).toString("hex");
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const Product = require("../models/Product"); const User = require("../models/User");
  const Cart = require("../models/Cart"); const Category = require("../models/Category"); const Brand = require("../models/Brand");
  const Order = require("../models/Order"); const Invoice = require("../models/Invoice"); const Lock = require("../models/OperationLock");
  const { createOrderFromCart, cancelOrderAndRestoreStock } = require("../services/orderService");
  const { getProducts } = require("../controllers/productController");
  try {
    await Promise.all([User, Product, Cart, Category, Brand, Order, Invoice, Lock].map((Model) => Model.init()));
    const user = await User.create({ name: "Integration customer", email: "integration@example.com", password: "TestOnlyPassword123" });
    const category = await Category.create({ name: "Test category", slug: "test-category" });
    const brand = await Brand.create({ name: "Test brand", slug: "test-brand" });
    const product = await Product.create({ name: "Discounted", slug: "discounted", price: 2000, discountPrice: 750, stock: 8, category: category._id, brandRef: brand._id });
    await Product.create({ name: "Regular", slug: "regular", price: 1000, stock: 8, category: category._id, brandRef: brand._id });
    let catalog;
    await getProducts({ query: { sort: "price_asc", category: category._id.toString() } }, { json: (value) => { catalog = value; } }, (error) => { throw error; });
    assert.equal(catalog.products[0]._id.toString(), product._id.toString());
    assert.equal(catalog.products[0].category.name, category.name);
    await Cart.create({ user: user._id, items: [{ product: product._id, quantity: 2, price: 1 }] });
    const input = { user, paymentMethod: "cod", checkoutKey: "native-mongo-checkout-key", shippingAddress: { line1: "Test Road", city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678" } };
    const created = await createOrderFromCart(input);
    assert.equal(created.order.totalAmount, 1620); assert.equal((await Product.findById(product._id)).stock, 6);
    const replay = await createOrderFromCart(input); assert.equal(replay.order._id.toString(), created.order._id.toString());
    assert.equal(await Order.countDocuments(), 1); assert.equal(await Invoice.countDocuments(), 1);
    await cancelOrderAndRestoreStock(created.order); await cancelOrderAndRestoreStock(created.order);
    assert.equal((await Product.findById(product._id)).stock, 8);
    assert.equal((await Invoice.findById(created.invoice._id)).paymentStatus, "cancelled");
  } finally {
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const { selection } = require("../services/inventoryService");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const { isPositiveInteger } = require("../utils/validation");
const { withOperationLock } = require("../services/operationLock");

const cartProductFields = "name images price discountPrice stock isArchived variants";
const serializeCart = (cart, userId) => {
  if (!cart) return { user: userId, items: [] };
  const value = cart.toObject();
  value.items = value.items.map((item) => {
    try { const selected = selection(item.product, item.variantId); return { ...item, ...selected, unavailable: false }; }
    catch (error) { return { ...item, unavailable: true, unavailableReason: error.message }; }
  });
  return value;
};
const getCart = async (req, res, next) => {
  try {
    // Reading/badge refresh does not save a stale cart over concurrent changes.
    const cart = await Cart.findOne({ user: req.user._id }).populate("items.product", cartProductFields);
    res.json(serializeCart(cart, req.user._id));
  } catch (error) { next(error); }
};
const mutateCart = (req, work) => withOperationLock("cart:" + req.user._id, async () => {
  const cart = await Cart.findOneAndUpdate({ user: req.user._id }, { $setOnInsert: { user: req.user._id, items: [] } }, { new: true, upsert: true, setDefaultsOnInsert: true });
  await work(cart);
  await cart.save();
  await cart.populate("items.product", cartProductFields);
  return serializeCart(cart, req.user._id);
});
const addToCart = async (req, res, next) => {
  try {
    const quantity = Number(req.body.quantity ?? 1);
    if (typeof req.body.productId !== "string" || !isPositiveInteger(quantity)) return res.status(400).json({ message: "A product and positive whole-number quantity are required" });
    const cart = await mutateCart(req, async (cart) => {
      const product = await Product.findById(req.body.productId);
      if (!product || product.isArchived) {
        const error = new Error("This product is no longer available"); error.statusCode = 404; throw error;
      }
      const selected = selection(product, req.body.variantId);
      const existing = cart.items.find((item) => item.product.toString() === product._id.toString() && String(item.variantId || "") === String(selected.variantId || ""));
      const requested = quantity + (existing?.quantity || 0);
      if (!isPositiveInteger(requested) || requested > selected.stock) {
        const error = new Error("Not enough stock available"); error.statusCode = 409; throw error;
      }
      if (existing) { existing.quantity = requested; existing.price = selected.price; }
      else cart.items.push({ product: product._id, quantity, ...selected });
    });
    res.status(201).json(cart);
  } catch (error) { next(error); }
};
const updateCartItem = async (req, res, next) => {
  try {
    const quantity = Number(req.body.quantity);
    if (!isPositiveInteger(quantity)) return res.status(400).json({ message: "Quantity must be a positive whole number" });
    res.json(await mutateCart(req, async (cart) => {
      const item = cart.items.id(req.params.itemId);
      if (!item) { const error = new Error("Cart item not found"); error.statusCode = 404; throw error; }
      const product = await Product.findById(item.product);
      const selected = selection(product, item.variantId);
      if (quantity > selected.stock) {
        const error = new Error("This quantity is unavailable. Please review your cart."); error.statusCode = 409; throw error;
      }
      item.quantity = quantity; item.price = selected.price;
    }));
  } catch (error) { next(error); }
};
const removeCartItem = async (req, res, next) => {
  try {
    res.json(await mutateCart(req, async (cart) => {
      const before = cart.items.length;
      cart.items = cart.items.filter((item) => item._id.toString() !== req.params.itemId);
      if (before === cart.items.length) { const error = new Error("Cart item not found"); error.statusCode = 404; throw error; }
    }));
  } catch (error) { next(error); }
};
const clearCart = async (req, res, next) => {
  try { await mutateCart(req, async (cart) => { cart.items = []; }); res.json({ message: "Cart cleared" }); }
  catch (error) { next(error); }
};
module.exports = { addToCart, clearCart, getCart, removeCartItem, serializeCart, updateCartItem };

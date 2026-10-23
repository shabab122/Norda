const express = require("express");
const router = express.Router();
const { getCart, addToCart, updateCartItem, removeCartItem, clearCart } = require("../controllers/cartController");
const { shopper: protect } = require("../services/guestService");

router.use(protect);
router.get("/", getCart);
router.post("/", addToCart);
router.put("/:itemId", updateCartItem);
router.delete("/:itemId", removeCartItem);
router.delete("/", clearCart);

module.exports = router;

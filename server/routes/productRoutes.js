const express = require("express");
const router = express.Router();
const {
  createProduct,
  getProducts,
  getManagedProducts,
  getManagedProduct,
  getProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");
const { protect, adminOnly } = require("../middleware/auth");

router.get("/", getProducts);
router.get("/manage", protect, adminOnly, getManagedProducts);
router.get("/manage/:id", protect, adminOnly, getManagedProduct);
router.get("/:id", getProduct);
router.post("/", protect, adminOnly, createProduct);
router.put("/:id", protect, adminOnly, updateProduct);
router.delete("/:id", protect, adminOnly, deleteProduct);

module.exports = router;

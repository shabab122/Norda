const { guard: mediaGuard } = require("../services/mediaService");
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
const { protect, authorize } = require("../middleware/auth");

router.get("/", getProducts);
router.get("/manage", protect, authorize("catalog"), getManagedProducts);
router.get("/manage/:id", protect, authorize("catalog"), getManagedProduct);
router.get("/:id", getProduct);
router.post("/", protect, authorize("catalog"), mediaGuard(createProduct));
router.put("/:id", protect, authorize("catalog"), mediaGuard(updateProduct));
router.delete("/:id", protect, authorize("catalog"), mediaGuard(deleteProduct));

module.exports = router;

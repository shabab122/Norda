const express = require("express");
const router = express.Router();
const {
  createCategory,
  getCategories,
  getCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");
const { protect, authorize } = require("../middleware/auth");

router.get("/", getCategories);
router.get("/:id", getCategory);
router.post("/", protect, authorize("catalog"), createCategory);
router.put("/:id", protect, authorize("catalog"), updateCategory);
router.delete("/:id", protect, authorize("catalog"), deleteCategory);

module.exports = router;

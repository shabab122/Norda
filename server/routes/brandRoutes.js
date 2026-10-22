const { guard: mediaGuard } = require("../services/mediaService");
const express = require("express");
const {
  createBrand,
  deleteBrand,
  getAllBrands,
  getBrand,
  getBrands,
  updateBrand,
} = require("../controllers/brandController");
const { authorize, protect } = require("../middleware/auth");

const router = express.Router();

router.get("/", getBrands);
router.get("/manage", protect, authorize("catalog"), getAllBrands);
router.get("/:id", getBrand);
router.post("/", protect, authorize("catalog"), mediaGuard(createBrand));
router.put("/:id", protect, authorize("catalog"), mediaGuard(updateBrand));
router.delete("/:id", protect, authorize("catalog"), mediaGuard(deleteBrand));

module.exports = router;

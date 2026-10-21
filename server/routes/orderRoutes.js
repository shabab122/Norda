const express = require("express");
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrder,
  getAllOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const operations = require("../controllers/orderOperationsController");
const { protect, adminOnly } = require("../middleware/auth");

router.post("/", protect, createOrder);
router.get("/my", protect, getMyOrders);
router.get("/", protect, adminOnly, getAllOrders);
router.get("/:id", protect, getOrder);
router.get("/:id/operations", protect, operations.getCustomerOperations);
router.post("/:id/requests", protect, operations.createCustomerRequest);
router.put("/:id/status", protect, adminOnly, updateOrderStatus);

module.exports = router;

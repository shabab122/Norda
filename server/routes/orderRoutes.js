const express = require("express");
const { getTracking, updateShipment } = require("../controllers/deliveryController");
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrder,
  getAllOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const operations = require("../controllers/orderOperationsController");
const { protect, authorize } = require("../middleware/auth");

router.post("/", protect, createOrder);
router.get("/my", protect, getMyOrders);
router.get("/", protect, authorize("orders"), getAllOrders);
router.get("/:id/tracking", protect, getTracking);
router.post("/:id/shipment", protect, authorize("orders"), updateShipment);
router.get("/:id", protect, getOrder);
router.get("/:id/operations", protect, operations.getCustomerOperations);
router.post("/:id/requests", protect, operations.createCustomerRequest);
router.put("/:id/status", protect, authorize("orders"), updateOrderStatus);

module.exports = router;

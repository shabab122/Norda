const express = require("express");
const {
  getInvoice,
  getInvoiceByOrder,
  getInvoices,
  getMyInvoices,
} = require("../controllers/invoiceController");
const { authorize } = require("../middleware/auth");
const { shopper: protect } = require("../services/guestService");

const router = express.Router();

router.get("/my", protect, getMyInvoices);
router.get("/order/:orderId", protect, getInvoiceByOrder);
router.get("/", protect, authorize("orders"), getInvoices);
router.get("/:id", protect, getInvoice);

module.exports = router;

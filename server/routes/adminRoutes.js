const express = require("express");
const router = express.Router();
const { dashboardSummary } = require("../controllers/dashboardController");
const { orderReportCsv } = require("../controllers/reportController");
const { protect, authorize } = require("../middleware/auth");

router.get("/dashboard-summary", protect, authorize("reports"), dashboardSummary);
router.get("/reports/orders.csv", protect, authorize("reports"), orderReportCsv);

module.exports = router;

const express = require("express");
const {
  getPaymentConfig,
  initiateSslcommerz,
  retrySslcommerz,
  sslcommerzCancel,
  sslcommerzFail,
  sslcommerzIpn,
  sslcommerzSuccess,
} = require("../controllers/paymentController");
const { shopper: protect } = require("../services/guestService");
const demo = require("../controllers/demoPaymentController");

const router = express.Router();

router.get("/config", getPaymentConfig);
router.post("/demo/initiate", protect, demo.initiate);
router.get("/demo/:orderId", protect, demo.getSession);
router.post("/demo/:orderId/complete", protect, demo.complete);
router.post("/sslcommerz/initiate", protect, initiateSslcommerz);
router.post("/sslcommerz/:orderId/retry", protect, retrySslcommerz);
router.post("/sslcommerz/success", sslcommerzSuccess);
router.post("/sslcommerz/fail", sslcommerzFail);
router.post("/sslcommerz/cancel", sslcommerzCancel);
router.post("/sslcommerz/ipn", sslcommerzIpn);

module.exports = router;

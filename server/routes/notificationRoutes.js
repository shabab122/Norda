const express = require("express");
const { protect, adminOnly } = require("../middleware/auth");
const { listNotifications, retryEmail } = require("../controllers/deliveryController");
const router = express.Router();
router.use(protect, adminOnly);
router.get("/", listNotifications);
router.post("/:id/retry", retryEmail);
module.exports = router;

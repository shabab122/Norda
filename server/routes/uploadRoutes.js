const express = require("express");
const router = express.Router();
const { uploadImage } = require("../controllers/uploadController");
const { protect, authorize } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.post("/", protect, authorize("catalog"), upload.single("image"), uploadImage);

module.exports = router;

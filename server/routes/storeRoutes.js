const express = require("express");
const router = express.Router();
router.get("/config", require("../controllers/commerceToolsController").getConfig);
module.exports = router;

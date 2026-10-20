const express = require("express");
const router = express.Router();
const { register, login, logout, getProfile, updateProfile } = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const rateLimit = require("express-rate-limit");
const account = require("../controllers/accountController");
const emailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Too many email requests. Please wait 15 minutes before trying again." } });
const tokenLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Too many account-link attempts. Please try again later." } });

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/forgot-password", emailLimiter, account.forgotPassword);
router.post("/reset-password", tokenLimiter, account.resetPassword);
router.post("/send-verification", protect, emailLimiter, account.sendVerification);
router.post("/verify-email", tokenLimiter, account.verifyEmail);
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);
router.get("/addresses", protect, account.listAddresses);
router.post("/addresses", protect, account.addressMutation("add"));
router.put("/addresses/:id/default", protect, account.addressMutation("default"));
router.put("/addresses/:id", protect, account.addressMutation("edit"));
router.delete("/addresses/:id", protect, account.addressMutation("delete"));

module.exports = router;

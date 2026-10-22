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

const handle = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };
router.get("/sessions", protect, handle((req) => require("../services/sessionService").listSessions(req.user, req.sessionId)));
router.post("/sessions/revoke-others", protect, async (req, res, next) => { try {
  const result = await require("../services/sessionService").revokeSessions(req.user, req.sessionId, null, true);
  const token = require("../utils/generateToken")(result.account._id, result.account.tokenVersion, result.sessionId);
  res.cookie("norda_token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: Math.max(0, +new Date((await require("../models/AuthSession").findById(result.sessionId)).expiresAt) - Date.now()) });
  const user = require("../services/addressBookService").profilePayload(result.account);
  if (process.env.AUTH_RETURN_TOKEN === "true") user.token = token;
  res.json({ revoked: result.revoked, currentRevoked: false, user });
} catch (e) { next(e); } });
router.delete("/sessions/:id", protect, handle((req) => require("../services/sessionService").revokeSessions(req.user, req.sessionId, req.params.id)));
router.put("/notification-preferences", protect, handle(async (req) => {
  const allowed = ["orderUpdates", "returnUpdates", "refundUpdates"];
  if (!req.body || !Object.keys(req.body).length || Object.keys(req.body).some((k) => !allowed.includes(k) || typeof req.body[k] !== "boolean")) { const e = new Error("Use true or false for the three email preferences"); e.statusCode = 400; throw e; }
  return require("../services/operationLock").withOperationLock("preferences:" + req.user._id, async () => {
    const User = require("../models/User"); const user = await User.findById(req.user._id);
    const preferences = { orderUpdates: true, returnUpdates: true, refundUpdates: true, ...(user.notificationPreferences?.toObject?.() || user.notificationPreferences || {}), ...req.body };
    await User.updateOne({ _id: user._id }, { $set: { notificationPreferences: preferences } });
    return { notificationPreferences: preferences, securityEmails: true };
  });
}));
module.exports = router;

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const mail = require("./mailService");
const httpError = require("../utils/httpError");

const RESET_MS = 30 * 60 * 1000;
const VERIFY_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const validPassword = (value) => typeof value === "string" && value.length >= 8 && Buffer.byteLength(value, "utf8") <= 72;
const tokenHash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const validToken = (value) => typeof value === "string" && /^[a-f\d]{64}$/.test(value);
const fieldsFor = (kind) => kind === "reset" ? { hash: "passwordResetHash", expiry: "passwordResetExpiresAt", requested: "passwordResetRequestedAt" } : { hash: "emailVerificationHash", expiry: "emailVerificationExpiresAt", requested: "emailVerificationRequestedAt" };

function accountActionUrl(kind, token) {
  let base;
  try { base = new URL(process.env.CLIENT_APP_URL || process.env.SERVER_URL || "http://localhost:5000"); }
  catch { throw httpError(503, "Set a valid CLIENT_APP_URL for account email"); }
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash || (process.env.NODE_ENV === "production" && base.protocol !== "https:")) throw httpError(503, "Account email requires a trusted CLIENT_APP_URL (HTTPS in production)");
  const url = new URL(kind === "reset" ? "reset-password.html" : kind === "guest" ? "guest-orders.html" : "verify-email.html", base.href.replace(/\/?$/, "/"));
  // A fragment is not sent in HTTP request logs or the Referer header.
  url.hash = kind === "guest" ? token : new URLSearchParams({ token }).toString();
  return url.href;
}

function safeMailError(error) {
  // SMTP exceptions may contain usernames, provider responses or message text.
  console.error("Account email delivery failed. Check SMTP configuration.", /^[A-Z\d_]{1,30}$/.test(error.code || "") ? error.code : "MAIL_ERROR");
}

async function issueAccountLink(email, kind, { background = false } = {}) {
  mail.mailConfiguration();
  const token = crypto.randomBytes(32).toString("hex");
  const actionUrl = accountActionUrl(kind, token);
  const fields = fieldsFor(kind);
  const now = new Date();
  const hash = tokenHash(token);
  const user = await User.findOneAndUpdate({
    email,
    ...(kind === "verify" ? { emailVerifiedAt: null } : {}),
    $or: [{ [fields.requested]: { $exists: false } }, { [fields.requested]: { $lte: new Date(now.getTime() - COOLDOWN_MS) } }],
  }, { $set: { [fields.hash]: hash, [fields.expiry]: new Date(now.getTime() + (kind === "reset" ? RESET_MS : VERIFY_MS)), [fields.requested]: now } }, { new: true });
  if (!user) return { delivery: "unchanged" };
  const deliver = async () => {
    try {
      return await mail.sendAccountMail({
        to: user.email, kind, actionUrl,
        subject: kind === "reset" ? "Reset your Norda password" : "Verify your Norda email address",
        text: kind === "reset"
          ? "Reset your Norda password using this link (valid for 30 minutes, once only):\n\n" + actionUrl + "\n\nIf you did not request this, ignore this email. Your password has not changed.\n"
          : "Confirm this email address for your Norda account (valid for 24 hours, once only):\n\n" + actionUrl + "\n\nIf you did not create this account, ignore this email.\n",
      });
    } catch (error) {
      // Only clear the failed attempt; never remove a newer successful link.
      await User.updateOne({ _id: user._id, [fields.hash]: hash }, { $unset: { [fields.hash]: 1, [fields.expiry]: 1, [fields.requested]: 1 } }).catch(() => {});
      safeMailError(error);
      throw httpError(503, "Email could not be sent. Please try again later or contact the store.");
    }
  };
  if (background) { void deliver().catch(() => {}); return { delivery: "requested" }; }
  return deliver();
}

async function resetAccountPassword(token, password, confirmPassword) {
  if (!validToken(token)) throw httpError(400, "This password reset link is invalid or has expired. Request a new link.");
  if (!validPassword(password)) throw httpError(400, "Password must be at least 8 characters and no more than 72 UTF-8 bytes");
  if (confirmPassword !== password) throw httpError(400, "The new passwords do not match");
  const hash = tokenHash(token);
  const filter = { passwordResetHash: hash, passwordResetExpiresAt: { $gt: new Date() } };
  if (!await User.exists(filter)) throw httpError(400, "This password reset link is invalid or has expired. Request a new link.");
  const passwordHash = await bcrypt.hash(password, 10);
  // One atomic write both consumes the link and changes the password. Two
  // concurrent submissions cannot both succeed, on standalone or replica sets.
  const user = await User.findOneAndUpdate({ passwordResetHash: hash, passwordResetExpiresAt: { $gt: new Date() } }, {
    $set: { password: passwordHash }, $inc: { tokenVersion: 1 },
    $unset: { passwordResetHash: 1, passwordResetExpiresAt: 1, passwordResetRequestedAt: 1, emailVerificationHash: 1, emailVerificationExpiresAt: 1, emailVerificationRequestedAt: 1 },
  }, { new: true, runValidators: true });
  if (!user) throw httpError(400, "This password reset link has already been used or has expired. Request a new link.");
  await mail.sendAccountMail({ to: user.email, kind: "password-changed", subject: "Your Norda password was changed", text: "Your Norda password was reset and previous sign-in sessions were signed out.\n\nIf you did not make this change, contact the store immediately.\n" }).catch(safeMailError);
}

async function verifyAccountEmail(token) {
  if (!validToken(token)) throw httpError(400, "This verification link is invalid or has expired. Request a new link from your profile.");
  const user = await User.findOneAndUpdate({ emailVerificationHash: tokenHash(token), emailVerificationExpiresAt: { $gt: new Date() }, emailVerifiedAt: null }, {
    $set: { emailVerifiedAt: new Date() },
    $unset: { emailVerificationHash: 1, emailVerificationExpiresAt: 1, emailVerificationRequestedAt: 1 },
  }, { new: true });
  if (!user) throw httpError(400, "This verification link was used or has expired. Check your profile or request a new link.");
}

module.exports = { accountActionUrl, issueAccountLink, resetAccountPassword, safeMailError, tokenHash, validPassword, verifyAccountEmail };

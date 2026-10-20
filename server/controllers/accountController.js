const { setTimeout: delay } = require("node:timers/promises");
const { cleanText, isValidEmail } = require("../utils/validation");
const recovery = require("../services/accountRecoveryService");
const { mutateAddressBook, profilePayload } = require("../services/addressBookService");

const forgotPassword = async (req, res, next) => {
  const started = Date.now();
  try {
    const email = cleanText(req.body.email, 254).toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ message: "Enter a valid email address" });
    // Mail delivery runs outside the response path. Existing, absent and
    // throttled accounts receive the same response and minimum response time.
    await recovery.issueAccountLink(email, "reset", { background: true });
    await delay(Math.max(0, 400 - (Date.now() - started)));
    res.json({ message: "If an account uses this email, a password reset link will arrive shortly. Check your inbox and spam folder. You can request another link after one minute." });
  } catch (error) { next(error); }
};

const resetPassword = async (req, res, next) => {
  try {
    await recovery.resetAccountPassword(req.body.token, req.body.password, req.body.confirmPassword);
    res.clearCookie("norda_token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    res.json({ message: "Password updated. Sign in with your new password. Previous sessions have been signed out." });
  } catch (error) { next(error); }
};

const sendVerification = async (req, res, next) => {
  try {
    if (req.user.emailVerifiedAt) return res.json({ message: "Your email address is already verified.", alreadyVerified: true });
    const result = await recovery.issueAccountLink(req.user.email, "verify");
    res.json({ message: result.delivery === "unchanged" ? "A verification link was recently requested. Check your inbox, or wait one minute before trying again." : "Verification email requested. Check your inbox and spam folder.", ...result });
  } catch (error) { next(error); }
};

const verifyEmail = async (req, res, next) => {
  try {
    await recovery.verifyAccountEmail(req.body.token);
    res.json({ message: "Email address verified. You can return to your account." });
  } catch (error) { next(error); }
};

const listAddresses = (req, res) => {
  const { addresses, defaultAddressId } = profilePayload(req.user);
  res.json({ addresses, defaultAddressId, limit: 10 });
};
const addressMutation = (action) => async (req, res, next) => {
  try {
    const profile = await mutateAddressBook(req.user._id, action, req.params.id, req.body);
    res.status(action === "add" ? 201 : 200).json(profile);
  } catch (error) { next(error); }
};

module.exports = { forgotPassword, resetPassword, sendVerification, verifyEmail, listAddresses, addressMutation };

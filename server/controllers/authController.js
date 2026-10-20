const jwt = require("jsonwebtoken");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { cleanText, isValidEmail } = require("../utils/validation");
const bcrypt = require("bcryptjs");
const { addressBook, plainAddress, profilePayload, validateAddress } = require("../services/addressBookService");
const { issueAccountLink, safeMailError, validPassword } = require("../services/accountRecoveryService");
const { withOperationLock } = require("../services/operationLock");

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: (Number(process.env.AUTH_COOKIE_DAYS) || 7) * 24 * 60 * 60 * 1000,
  path: "/",
});

const sendSession = (res, user, statusCode = 200, extra = {}) => {
  const token = generateToken(user._id, user.tokenVersion || 0);
  res.cookie("norda_token", token, cookieOptions());
  const payload = { ...profilePayload(user), ...extra };
  if (process.env.AUTH_RETURN_TOKEN === "true") payload.token = token;
  res.status(statusCode).json(payload);
};

// @desc Register a new user
// @route POST /api/auth/register
const validatePassword = validPassword;

const cleanAddress = (value = {}) => {
  const address = value && typeof value === "object" ? value : {};
  return {
    line1: cleanText(address.line1, 120),
    line2: cleanText(address.line2, 120),
    city: cleanText(address.city, 60),
    district: cleanText(address.district, 60),
    postCode: cleanText(address.postCode, 20),
    country: cleanText(address.country, 60) || "Bangladesh",
    phone: cleanText(address.phone, 20),
  };
};

const register = async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 80);
    const email = cleanText(req.body.email, 254).toLowerCase();
    const { password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Please provide name, email and password" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters and no more than 72 UTF-8 bytes" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    const user = await User.create({ name, email, password, emailVerifiedAt: null });
    let verificationEmail;
    try { verificationEmail = await issueAccountLink(email, "verify"); }
    catch (error) { safeMailError(error); verificationEmail = { delivery: "unavailable" }; }
    // Email delivery trouble must not leave a successfully created account
    // looking like a failed registration or discard a guest's cart selection.
    sendSession(res, user, 201, { verificationEmail });
  } catch (error) {
    next(error);
  }
};

// @desc Login user (or admin) and return a token
// @route POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 254).toLowerCase();
    const { password } = req.body;
    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({ message: "Please provide email and password" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    sendSession(res, user);
  } catch (error) {
    next(error);
  }
};

// @desc Get logged in user's profile
// @route GET /api/auth/profile
const getProfile = async (req, res) => {
  res.json(profilePayload(req.user));
};

// @desc Update logged in user's profile
// @route PUT /api/auth/profile
const updateProfile = async (req, res, next) => {
  try {
    await withOperationLock("address-book:" + req.user._id, async () => {
      const user = await User.findById(req.user._id).select("+password");
      if (!user) return res.status(404).json({ message: "User not found" });
      const fields = {};
      if (req.body.name !== undefined) {
        fields.name = cleanText(req.body.name, 80);
        if (!fields.name) return res.status(400).json({ message: "Name cannot be empty" });
      }
      if (req.body.address !== undefined) {
        fields.address = cleanAddress(req.body.address);
        if (user.addresses?.length) {
          const book = addressBook(user);
          const entry = book.addresses.find((item) => item.isDefault);
          const updated = validateAddress({ ...entry, ...fields.address });
          fields.addresses = book.addresses.map(({ isDefault, ...item }) => item._id === entry._id ? { _id: entry._id, ...updated } : item);
          fields.address = plainAddress(updated);
          fields.defaultAddressId = entry._id;
        }
      }
      const update = { $set: fields };
      if (req.body.password !== undefined) {
        if (typeof req.body.currentPassword !== "string" || !(await user.matchPassword(req.body.currentPassword))) return res.status(400).json({ message: "Your current password is incorrect" });
        if (!validatePassword(req.body.password)) return res.status(400).json({ message: "Password must be at least 8 characters and no more than 72 UTF-8 bytes" });
        fields.password = await bcrypt.hash(req.body.password, 10);
        update.$inc = { tokenVersion: 1 };
        update.$unset = { passwordResetHash: 1, passwordResetExpiresAt: 1, passwordResetRequestedAt: 1 };
      }
      const version = req.user.tokenVersion || 0;
      const updated = await User.findOneAndUpdate({ _id: req.user._id, $or: [{ tokenVersion: version }, ...(version ? [] : [{ tokenVersion: { $exists: false } }])] }, update, { new: true, runValidators: true });
      if (!updated) return res.status(409).json({ message: "Your account changed. Refresh and sign in again before saving." });
      sendSession(res, updated);
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : req.cookies?.norda_token;
    let decoded;
    try { if (token) decoded = jwt.verify(token, process.env.JWT_SECRET); } catch { /* Already expired. */ }
    if (decoded?.id) {
      await User.updateOne({ _id: decoded.id, $or: [{ tokenVersion: decoded.version || 0 }, ...(decoded.version ? [] : [{ tokenVersion: { $exists: false } }])] }, { $inc: { tokenVersion: 1 } });
    }
    const { maxAge, ...clearOptions } = cookieOptions();
    res.clearCookie("norda_token", clearOptions);
    res.json({ message: "Logged out" });
  } catch (error) { next(error); }
};

module.exports = { register, login, logout, getProfile, updateProfile };

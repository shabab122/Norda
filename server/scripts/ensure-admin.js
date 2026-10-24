const User = require("../models/User");
const { isValidEmail, cleanText } = require("../utils/validation");

// Operator-only CLI. It is never mounted as a public registration endpoint.
async function ensureAdmin({ email, password, name } = {}) {
  email = String(email || "").trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error("Configure ADMIN_EMAIL in the existing private server environment first");
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== "admin" || existing.isGuest) throw new Error("ADMIN_EMAIL belongs to a non-admin account. Choose a separate administrator email; no account was changed.");
    return { created: false, id: String(existing._id) };
  }
  if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) throw new Error("A new administrator requires ADMIN_PASSWORD of at least 12 characters and at most 72 UTF-8 bytes");
  try {
    const user = await User.create({ name: cleanText(name, 80) || "Store administrator", email, password, role: "admin" });
    return { created: true, id: String(user._id) };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const current = await User.findOne({ email });
    if (!current || current.role !== "admin" || current.isGuest) throw new Error("The email was registered by another account; no permissions or passwords were changed");
    return { created: false, id: String(current._id) };
  }
}
async function main() {
  const path = require("node:path"), mongoose = require("mongoose");
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
  require("dotenv").config({ path: path.resolve(__dirname, "../.env.integrations") });
  if (!process.env.MONGO_URI) throw new Error("Keep the existing working MONGO_URI configured before preparing an admin");
  try {
    await require("../config/db")(); await User.init();
    const result = await ensureAdmin({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, name: process.env.ADMIN_NAME });
    console.log(result.created ? "Administrator created. Sign in with the configured ADMIN_EMAIL and ADMIN_PASSWORD." : "Existing administrator preserved, including its password. Sign in with its current credentials.");
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { ensureAdmin };

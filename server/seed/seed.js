require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const connectDB = require("../config/db");
const { seedCatalog } = require("./seedCatalog");
async function seed() {
  await connectDB();
  if (!process.argv.includes("--catalog-only")) {
    const email = String(process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
    const existing = await User.findOne({ email });
    if (existing && existing.role !== "admin") throw new Error("ADMIN_EMAIL belongs to a customer. Choose a different ADMIN_EMAIL.");
    if (!existing) {
      if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) throw new Error("Set ADMIN_PASSWORD to at least 12 characters before creating the admin");
      await User.create({ name: process.env.ADMIN_NAME || "Super Admin", email, password: process.env.ADMIN_PASSWORD, role: "admin" });
      console.log("Admin account created for " + email);
    } else console.log("Existing admin preserved, including its password.");
  }
  console.log(await seedCatalog());
}
seed().then(async () => { await mongoose.disconnect(); }).catch(async (error) => {
  console.error("Seeding failed:", error.message); await mongoose.disconnect().catch(() => {}); process.exitCode = 1;
});

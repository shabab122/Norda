const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120 },
    city: { type: String, trim: true, maxlength: 60 },
    district: { type: String, trim: true, maxlength: 60 },
    postCode: { type: String, trim: true, maxlength: 20 },
    country: { type: String, trim: true, maxlength: 60, default: "Bangladesh" },
    phone: { type: String, trim: true, maxlength: 20 },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
      trim: true,
      maxlength: 80,
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    address: addressSchema,
    // The original address remains available to older clients. Address-book
    // defaults are resolved separately, so checkout cannot overwrite the book.
    addresses: {
      type: [new mongoose.Schema({
        _id: { type: String, required: true },
        label: { type: String, required: true, trim: true, maxlength: 30 },
        ...addressSchema.obj,
      })],
      default: [],
      validate: [(value) => value.length <= 10, "You can save up to 10 delivery addresses"],
    },
    defaultAddressId: { type: String, default: null },
    emailVerifiedAt: { type: Date, default: null },
    passwordResetHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    passwordResetRequestedAt: { type: Date, select: false },
    emailVerificationHash: { type: String, select: false },
    emailVerificationExpiresAt: { type: Date, select: false },
    emailVerificationRequestedAt: { type: Date, select: false },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);

const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, maxlength: 32 },
  title: { type: String, required: true, maxlength: 100 },
  type: { type: String, enum: ["percentage", "fixed"], required: true },
  value: { type: Number, required: true, min: 0.01 },
  minSubtotal: { type: Number, default: 0, min: 0 }, maxDiscount: { type: Number, default: 0, min: 0 },
  startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true },
  usageLimit: { type: Number, default: 0, min: 0 }, perUserLimit: { type: Number, default: 1, min: 0 },
  usedCount: { type: Number, default: 0, min: 0 },
  isActive: { type: Boolean, default: true }, isPublic: { type: Boolean, default: true },
  revision: { type: Number, default: 0 },
}, { timestamps: true });
module.exports = mongoose.model("Coupon", schema);

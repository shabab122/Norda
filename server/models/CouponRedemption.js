const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
  code: { type: String, required: true }, discountAmount: { type: Number, required: true, min: 0 },
}, { timestamps: true });
schema.index({ coupon: 1, user: 1 });
module.exports = mongoose.model("CouponRedemption", schema);

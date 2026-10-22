const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  _id: { type: String, default: "store" }, revision: { type: Number, default: 0 },
  supportEmail: { type: String, default: "" }, supportPhone: { type: String, default: "" },
  address: { type: String, default: "Dhaka, Bangladesh" }, supportHours: { type: String, default: "" },
  returnWindowDays: { type: Number, min: 0, max: 365, default: 30 }, exchangeEnabled: { type: Boolean, default: true },
  freeShippingThreshold: { type: Number, min: 0 }, flatShippingFee: { type: Number, min: 0 },
  announcement: { text: String, url: String, visible: Boolean },
  hero: { eyebrow: String, title: String, description: String, buttonLabel: String, buttonUrl: String, imageUrl: String, visible: Boolean },
  faq: [{ _id: false, question: String, answer: String }],
  policies: { delivery: String, returns: String, privacy: String, terms: String },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
module.exports = mongoose.model("StoreSettings", schema);

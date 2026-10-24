const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["cancellation", "return"], required: true },
  requestKey: { type: String, required: true, maxlength: 80 },
  reason: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ["requested", "approved", "rejected", "received", "completed"], default: "requested" },
  decisionMessage: { type: String, default: "", maxlength: 1000 },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, decidedAt: Date,
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, receivedAt: Date,
  restocked: { type: Boolean, default: false },
  refundAmount: { type: Number, min: 0, default: 0 },
  returnTerms: mongoose.Schema.Types.Mixed, receiptProgress: [mongoose.Schema.Types.Mixed], advancedReceiptCount: { type: Number, default: 0 }, refund: mongoose.Schema.Types.ObjectId, creditNote: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });
schema.index({ user: 1, requestKey: 1 }, { unique: true });
schema.index({ type: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model("OrderRequest", schema);

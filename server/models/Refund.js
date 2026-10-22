const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
  gateway: { type: String, enum: ["sslcommerz", "demo", "manual"], required: true },
  scope: { type: String, enum: ["order", "extra_payment"], required: true },
  requestKey: { type: String, required: true, maxlength: 80 },
  transactionId: { type: String, required: true, maxlength: 30, unique: true },
  originalTransactionId: { type: String, default: "", maxlength: 100 },
  validationId: { type: String, default: "", maxlength: 100 },
  bankTransactionId: { type: String, default: "", maxlength: 100 },
  refundReference: { type: String, maxlength: 100 },
  amount: { type: Number, required: true, min: 0.01 }, currency: { type: String, default: "BDT" },
  status: { type: String, enum: ["awaiting_return", "queued", "submitting", "pending", "unknown", "succeeded", "failed"], required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  failureReason: { type: String, default: "", maxlength: 500 },
  itemCase: { type: mongoose.Schema.Types.ObjectId, ref: "ItemReturnCase" },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  submittedAt: Date, completedAt: Date, lastCheckedAt: Date,
  manualReference: { type: String, default: "", maxlength: 120 },
}, { timestamps: true });
schema.index({ order: 1, requestKey: 1 }, { unique: true });
schema.index({ refundReference: 1 }, { unique: true, partialFilterExpression: { refundReference: { $type: "string" } } });
schema.index({ status: 1, updatedAt: 1 });
module.exports = mongoose.model("Refund", schema);

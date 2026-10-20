const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    gateway: { type: String, enum: ["sslcommerz", "demo"], default: "sslcommerz" },
    channel: { type: String, enum: ["", "mobile_banking", "card_bank"], default: "" },
    transactionId: { type: String, required: true, unique: true, index: true },
    retryKey: { type: String, maxlength: 80 },
    duplicateValidationIds: { type: [String], default: [] },
    sessionKey: { type: String, default: "" },
    checkoutUrl: { type: String, default: "" },
    validationId: { type: String, default: "" },
    bankTransactionId: { type: String, default: "" },
    cardType: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "BDT", uppercase: true },
    status: {
      type: String,
      enum: ["initiated", "paid", "failed", "cancelled", "review", "error"],
      default: "initiated",
    },
    riskLevel: { type: Number, default: 0 },
    failureReason: { type: String, default: "", maxlength: 500 },
    paidAt: Date,
  },
  { timestamps: true }
);

paymentSchema.index({ order: 1, retryKey: 1 }, { unique: true, partialFilterExpression: { retryKey: { $type: "string" } } });

module.exports = mongoose.model("Payment", paymentSchema);

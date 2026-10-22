const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  key: { type: String, required: true, unique: true },
  topic: { type: String, enum: ["confirmation", "payment", "shipping", "delivery", "cancellation", "tracking", "return", "refund"], required: true },
  to: { type: String, required: true }, subject: { type: String, required: true }, text: { type: String, required: true },
  actionUrl: String, messageId: String, sourceState: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ["held", "queued", "sending", "sent", "failed", "suppressed"], default: "held" },
  attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, default: Date.now },
  claimedAt: Date, claimToken: String, sentAt: Date, transport: String,
  deliveryStatus: { type: String, enum: ["unknown", "accepted", "preview", "delivered", "bounced", "complained"], default: "unknown" },
  deliveryReason: { type: String, maxlength: 500 }, deliveryUpdatedAt: Date,
  lastError: { type: String, default: "" },
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
module.exports = mongoose.model("OrderNotification", schema);

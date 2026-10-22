const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  actorRole: { type: String, enum: ["user", "admin", "staff", "system"], required: true },
  action: { type: String, required: true, maxlength: 80 },
  note: { type: String, default: "", maxlength: 1000 },
  request: { type: mongoose.Schema.Types.ObjectId, ref: "OrderRequest" },
  refund: { type: mongoose.Schema.Types.ObjectId, ref: "Refund" },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
}, { timestamps: true });
schema.index({ order: 1, createdAt: -1 });
module.exports = mongoose.model("OrderEvent", schema);

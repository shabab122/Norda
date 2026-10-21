const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  requestKey: { type: String, required: true, maxlength: 100 },
  event: { type: String, enum: ["details_updated", "shipped", "in_transit", "out_for_delivery", "delivery_attempted", "delivered"], required: true },
  courierName: { type: String, default: "", maxlength: 80 }, trackingNumber: { type: String, default: "", maxlength: 100 }, trackingUrl: { type: String, default: "", maxlength: 500 },
  location: { type: String, default: "", maxlength: 120 }, note: { type: String, default: "", maxlength: 500 },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
schema.index({ order: 1, requestKey: 1 }, { unique: true });
module.exports = mongoose.model("ShipmentEvent", schema);

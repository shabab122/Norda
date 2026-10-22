const mongoose = require("mongoose");
const schema = new mongoose.Schema({ booking: { type: mongoose.Schema.Types.ObjectId, ref: "CourierBooking", required: true }, order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true }, key: { type: String, required: true }, status: String, note: String, occurredAt: Date, kind: { type: String, enum: ["tracking", "exception", "resolution", "booking", "cancellation"], required: true }, actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" } }, { timestamps: true });
schema.index({ booking: 1, key: 1 }, { unique: true });
module.exports = mongoose.model("CourierEvent", schema);

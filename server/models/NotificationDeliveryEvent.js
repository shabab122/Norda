const mongoose = require("mongoose");
const schema = new mongoose.Schema({ notification: { type: mongoose.Schema.Types.ObjectId, ref: "OrderNotification", required: true }, provider: { type: String, required: true, maxlength: 80 }, eventId: { type: String, required: true, maxlength: 160 }, kind: { type: String, enum: ["delivered", "bounced", "complained"], required: true }, occurredAt: { type: Date, required: true }, reason: { type: String, maxlength: 500 }, actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" } }, { timestamps: true });
schema.index({ provider: 1, eventId: 1 }, { unique: true });
module.exports = mongoose.model("NotificationDeliveryEvent", schema);

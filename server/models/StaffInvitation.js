const mongoose = require("mongoose");
const schema = new mongoose.Schema({ email: { type: String, required: true }, permissions: [String], requireMfa: { type: Boolean, default: true }, tokenHash: { type: String, required: true, select: false }, requestKey: { type: String, unique: true, required: true }, intentHash: String, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, status: { type: String, enum: ["pending", "accepted", "revoked"], default: "pending" }, expiresAt: Date, acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, acceptedAt: Date, delivery: String }, { timestamps: true });
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });
module.exports = mongoose.model("StaffInvitation", schema);

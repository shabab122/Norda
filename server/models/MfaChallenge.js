const mongoose = require("mongoose");
const schema = new mongoose.Schema({ hash: { type: String, required: true, unique: true, select: false }, user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, tokenVersion: Number, revision: Number, attempts: { type: Number, default: 0 }, usedAt: Date, expiresAt: { type: Date, required: true } }, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("MfaChallenge", schema);

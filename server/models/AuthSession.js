const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenVersion: { type: Number, required: true }, expiresAt: { type: Date, required: true },
  revokedAt: Date, lastSeenAt: { type: Date, required: true }, device: { type: String, maxlength: 240 },
  ipHint: { type: String, maxlength: 80 }, legacyTokenHash: { type: String, select: false },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ legacyTokenHash: 1 }, { unique: true, partialFilterExpression: { legacyTokenHash: { $type: "string" } } });
module.exports = mongoose.model("AuthSession", schema);

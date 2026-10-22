const mongoose = require("mongoose");

const uploadSchema = new mongoose.Schema(
  {
    storage: { type: String, enum: ["local", "cloudinary"], default: "local" },
    status: { type: String, enum: ["active", "uploading", "unknown", "failed", "deleting", "cleanup_unknown", "deleted"], default: "active" },
    cloudName: String, cloudPublicId: String, cloudAssetId: String, cloudUrl: String, cloudVersion: Number,
    sourceHash: String, migrated: Boolean, deletedAt: Date, lastError: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    originalName: { type: String, required: true },
    filename: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Upload", uploadSchema);

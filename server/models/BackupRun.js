const mongoose = require("mongoose");
module.exports = mongoose.model("BackupRun", new mongoose.Schema({ status: { type: String, enum: ["running", "succeeded", "failed"], required: true }, filename: String, bytes: Number, collections: Number, documents: Number, mediaFiles: Number, keyId: String, startedAt: Date, completedAt: Date, failureCode: String }, { timestamps: true }));

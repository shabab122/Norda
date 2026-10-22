const mongoose = require("mongoose");
module.exports = mongoose.model("StaffAudit", new mongoose.Schema({ actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, target: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, previousRole: String, role: String, previousPermissions: [String], permissions: [String], note: String }, { timestamps: true }));

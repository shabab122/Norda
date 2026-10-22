const mongoose = require("mongoose");
module.exports = mongoose.model("MaintenanceGate", new mongoose.Schema({ _id: String, mode: { type: String, enum: ["open", "backup"], default: "open" }, owner: String, expiresAt: Date, writers: [{ _id: false, token: String, expiresAt: Date }] }, { timestamps: true }));

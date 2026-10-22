const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  requestKey: { type: String, required: true, unique: true, maxlength: 80 },
  sourceHash: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["processing", "completed"], default: "processing" },
  entries: [{
    _id: false, productId: String, name: String, rows: [mongoose.Schema.Types.Mixed],
    status: { type: String, enum: ["pending", "applying", "applied", "conflict", "review"], default: "pending" },
    message: { type: String, default: "" },
  }],
}, { timestamps: true });
module.exports = mongoose.model("InventoryImport", schema);

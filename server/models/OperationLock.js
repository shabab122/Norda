const mongoose = require("mongoose");

// Shared across API processes, unlike an in-memory mutex.
const schema = new mongoose.Schema({
  _id: String,
  owner: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("OperationLock", schema);

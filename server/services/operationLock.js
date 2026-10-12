const crypto = require("node:crypto");
const OperationLock = require("../models/OperationLock");
const httpError = require("../utils/httpError");

const LEASE_MS = 5 * 60 * 1000;
const withOperationLock = async (resource, work) => {
  const owner = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + LEASE_MS);
  try {
    await OperationLock.create({ _id: resource, owner, expiresAt });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const reclaimed = await OperationLock.findOneAndUpdate(
      { _id: resource, expiresAt: { $lte: new Date() } },
      { $set: { owner, expiresAt } },
      { new: true }
    );
    if (!reclaimed) throw httpError(409, "Another update is in progress. Please wait a moment and try again.");
  }
  const heartbeat = setInterval(() => {
    OperationLock.updateOne({ _id: resource, owner }, { $set: { expiresAt: new Date(Date.now() + LEASE_MS) } })
      .catch((error) => console.error("Operation lease renewal failed:", error.message));
  }, 30000);
  heartbeat.unref();
  try { return await work(); }
  finally {
    clearInterval(heartbeat);
    await OperationLock.deleteOne({ _id: resource, owner })
      .catch((error) => console.error("Operation lease release failed:", error.message));
  }
};
module.exports = { withOperationLock };

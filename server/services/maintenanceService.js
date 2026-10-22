const crypto = require("node:crypto");
const Gate = require("../models/MaintenanceGate");
const httpError = require("../utils/httpError");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function ensureGate() { try { await Gate.findOneAndUpdate({ _id: "store" }, { $setOnInsert: { mode: "open", writers: [] } }, { upsert: true, new: true }); } catch (e) { if (e.code !== 11000) throw e; } }
async function acquireWriter() {
  await ensureGate(); const token = crypto.randomUUID();
  const row = await Gate.findOneAndUpdate({ _id: "store", $or: [{ mode: "open" }, { expiresAt: { $lte: new Date() } }] }, { $push: { writers: { token, expiresAt: new Date(Date.now() + 90000) } } }, { new: true });
  if (!row) throw httpError(503, "A consistent backup is running. Please retry this action shortly.");
  let stopped = false;
  const timer = setInterval(() => { Gate.updateOne({ _id: "store", "writers.token": token }, { $set: { "writers.$.expiresAt": new Date(Date.now() + 90000) } }).catch(() => {}); }, 20000); timer.unref();
  return async () => { if (stopped) return; stopped = true; clearInterval(timer); await Gate.updateOne({ _id: "store" }, { $pull: { writers: { token } } }).catch(() => {}); };
}
async function withWriteLease(work) { const release = await acquireWriter(); try { return await work(); } finally { await release(); } }
async function writeMiddleware(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  try {
    const release = await acquireWriter(), end = res.end;
    // Controllers finish their awaited writes before ending the response. A
    // disconnected client alone must not release a still-running operation.
    res.end = function (...args) { release().catch(() => {}); return end.apply(this, args); };
    next();
  } catch (e) { if (e.statusCode === 503) res.setHeader("Retry-After", "30"); next(e); }
}
async function withBackupGate(work, { drainMs = 30000 } = {}) {
  await ensureGate(); const owner = crypto.randomUUID();
  const held = await Gate.findOneAndUpdate({ _id: "store", $or: [{ mode: "open" }, { expiresAt: { $lte: new Date() } }] }, { $set: { mode: "backup", owner, expiresAt: new Date(Date.now() + 90000) } }, { new: true });
  if (!held) throw httpError(409, "Another backup is already running");
  let lost = false;
  const timer = setInterval(() => { Gate.updateOne({ _id: "store", owner, mode: "backup" }, { $set: { expiresAt: new Date(Date.now() + 90000) } }).then((r) => { if (!r.matchedCount) lost = true; }).catch(() => { lost = true; }); }, 20000); timer.unref();
  const assertOwner = async () => { if (lost || !await Gate.exists({ _id: "store", owner, mode: "backup", expiresAt: { $gt: new Date() } })) throw httpError(409, "Backup lease was interrupted; no complete backup was published"); };
  try {
    const limit = Date.now() + drainMs;
    while (true) { await assertOwner(); const current = await Gate.findById("store"); if (!(current.writers || []).some((w) => +new Date(w.expiresAt) > Date.now())) break; if (Date.now() >= limit) throw httpError(409, "Active writes did not finish. Retry the backup after current operations complete."); await pause(100); }
    return await work(assertOwner);
  } finally { clearInterval(timer); await Gate.updateOne({ _id: "store", owner }, { $set: { mode: "open", owner: "", expiresAt: new Date(0) }, $pull: { writers: { expiresAt: { $lte: new Date() } } } }).catch(() => {}); }
}
module.exports = { ensureGate, acquireWriter, withWriteLease, writeMiddleware, withBackupGate };

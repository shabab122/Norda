const fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto"), { createReadStream } = require("node:fs"), mongoose = require("mongoose");
const Remote = require("../models/OffsiteBackup"), Run = require("../models/BackupRun"), Drill = require("../models/RestoreDrill"), s3 = require("./s3Service"), backup = require("./backupService"), { withOperationLock } = require("./operationLock"), httpError = require("../utils/httpError");
async function digest(file) { const h = crypto.createHash("sha256"); for await (const b of createReadStream(file)) h.update(b); return h.digest("hex"); }
async function uploadRun(id) { return withOperationLock("offsite-backups", async () => {
  const c = s3.configuration(); if (!c.ready) throw httpError(503, "Configure private off-host storage first");
  const run = await Run.findById(id); if (!run || run.status !== "succeeded" || !/^norda-backup-[a-zA-Z0-9_-]+\.ndb$/.test(run.filename)) throw httpError(400, "Choose a completed local NORDA backup");
  let row = await Remote.findOne({ run: id }); if (row && row.destination !== c.destination) throw httpError(409, "This archive belongs to another storage destination; retain its configuration for recovery"); if (row?.status === "deleted") throw httpError(409, "This archive was removed by retention");
  const file = path.join(backup.backupDirectory(), run.filename), bytes = (await fs.stat(file)).size; if (bytes > 5 * 1024 ** 3) throw httpError(413, "Single-object backups support up to 5 GiB"); const sha256 = await digest(file);
  if (row && (row.sha256 !== sha256 || row.bytes !== bytes)) throw httpError(409, "The local archive changed after its first upload attempt");
  await backup.verifyBackup(file);
  if (!row) row = await Remote.create({ run: id, destination: c.destination, key: c.prefix + run.filename, sha256, bytes, sourceCreatedAt: run.completedAt || run.createdAt, status: "pending" });
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "norda-offsite-check-")); await fs.chmod(temp, 0o700);
  try {
    await Remote.updateOne({ _id: row._id }, { $set: { lastAttemptAt: new Date() } });
    const existing = await s3.head(row.key); if (existing && (existing.sha256 !== sha256 || existing.bytes !== bytes)) throw httpError(409, "Remote backup identity/checksum mismatch; nothing was overwritten");
    if (!existing) await s3.put(row.key, file, sha256, bytes);
    await s3.download(row.key, path.join(temp, "readback.ndb"), { sha256, bytes });
    await Remote.updateOne({ _id: row._id }, { $set: { status: "verified", verifiedAt: new Date(), pointerSynced: false } });
    const latest = await Remote.findOne({ destination: c.destination, status: "verified" }).sort({ sourceCreatedAt: -1, createdAt: -1 });
    await s3.manifest({ version: 1, key: latest.key, bytes: latest.bytes, sha256: latest.sha256, verifiedAt: latest.verifiedAt });
    await Remote.updateOne({ _id: row._id }, { $set: { pointerSynced: true } });
    return Remote.findById(row._id);
  } catch (e) { await Remote.updateOne({ _id: row._id, status: { $ne: "verified" } }, { $set: { status: "failed" } }); throw e; } finally { await fs.rm(temp, { recursive: true, force: true }); }
}); }
async function fetchLatest(output) { const row = await s3.latest(); if (!path.isAbsolute(output || "")) throw httpError(400, "Choose an absolute new private archive path"); const directory = path.dirname(output); const stat = await fs.lstat(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) throw httpError(400, "Choose a real private destination directory"); await fs.chmod(directory, 0o700); await s3.download(row.key, output, row); try { const verified = await backup.verifyBackup(output); return { ...verified, file: output, key: row.key }; } catch (e) { await fs.unlink(output).catch(() => {}); throw e; } }
async function retention() { if (process.env.OFFSITE_RETENTION_ENABLED !== "true") return { deleted: 0 }; return withOperationLock("offsite-backups", async () => {
  const c = s3.configuration(), days = Number(process.env.OFFSITE_RETENTION_DAYS || 30), keep = Number(process.env.OFFSITE_MIN_COPIES || 3); if (!Number.isInteger(days) || days < 7 || days > 3650 || !Number.isInteger(keep) || keep < 2 || keep > 100) throw httpError(503, "Retention requires 7–3650 days and at least 2–100 verified copies");
  const rows = await Remote.find({ destination: c.destination, status: "verified" }).sort({ sourceCreatedAt: -1, createdAt: -1 }); let deleted = 0;
  for (const row of rows.slice(keep)) if (Date.now() - +new Date(row.createdAt) > days * 86400000) { await s3.remove(row.key); await Remote.updateOne({ _id: row._id }, { $set: { status: "deleted", deletedAt: new Date() } }); deleted++; }
  return { deleted };
}); }
async function drill() { return withOperationLock("offsite-drill", async () => {
  const c = s3.configuration(), remote = await Remote.findOne({ destination: c.destination, status: "verified" }).sort({ sourceCreatedAt: -1, createdAt: -1 }); if (!remote) throw httpError(409, "Upload and verify an off-host backup before a restore drill");
  const row = await Drill.create({ backup: remote._id, status: "running", startedAt: new Date() }), directory = await fs.mkdtemp(path.join(os.tmpdir(), "norda-recovery-drill-")), database = "norda_restore_drill_" + crypto.randomBytes(10).toString("hex"); await fs.chmod(directory, 0o700); let restored = false, cleanupComplete = false;
  try { const file = path.join(directory, "archive.ndb"); await s3.download(remote.key, file, remote); const result = await backup.restoreBackup(file, { database, outputDirectory: path.join(directory, "restored") }); restored = true; await mongoose.connection.getClient().db(database).dropDatabase(); restored = false; cleanupComplete = true; await Drill.updateOne({ _id: row._id }, { $set: { status: "succeeded", database, collections: result.collections, documents: result.documents, completedAt: new Date(), cleanupComplete } }); return Drill.findById(row._id); }
  catch (e) { await Drill.updateOne({ _id: row._id }, { $set: { status: "failed", database, completedAt: new Date(), cleanupComplete } }); throw e; }
  finally { if (restored) { await mongoose.connection.getClient().db(database).dropDatabase().then(() => Drill.updateOne({ _id: row._id }, { $set: { cleanupComplete: true } })).catch(() => {}); } await fs.rm(directory, { recursive: true, force: true }); }
}); }
async function sweep() {
  if (!s3.configuration().ready) return;
  const c = s3.configuration();
  for (const run of await Run.find({ status: "succeeded" }).sort({ createdAt: -1 }).limit(20)) { const prior = await Remote.findOne({ run: run._id }); if (!prior || ((prior.status === "verified" && !prior.pointerSynced || ["failed", "pending"].includes(prior.status)) && Date.now() - +new Date(prior.lastAttemptAt || 0) > 300000)) await uploadRun(run._id); }
  await retention();
  const hours = Number(process.env.BACKUP_DRILL_INTERVAL_HOURS || 0); if (hours) { if (!Number.isInteger(hours) || hours < 24 || hours > 8760) throw httpError(503, "Restore drill interval must be 24–8760 hours"); const last = await Drill.findOne({}).sort({ createdAt: -1 }); if (!last || Date.now() - +new Date(last.startedAt || last.createdAt) >= hours * 3600000) await drill(); }
}
function startWorker() { let running, stopped = false; const tick = () => { if (stopped || running || !s3.configuration().ready) return; running = sweep().catch(() => require("./operationsService").recordEvent({ kind: "OFFSITE_BACKUP_REVIEW", summary: "Off-host backup, retention or restore drill needs operational review." }).catch(() => {})).finally(() => running = null); }; const timer = setInterval(tick, 60000); timer.unref(); tick(); return async () => { stopped = true; clearInterval(timer); if (running) await running; }; }
module.exports = { uploadRun, fetchLatest, retention, drill, sweep, startWorker };

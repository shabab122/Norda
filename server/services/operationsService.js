const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const Event = require("../models/OperationalEvent");
const BackupRun = require("../models/BackupRun");
const { isValidEmail } = require("../utils/validation");
const httpError = require("../utils/httpError");
function alertChannel() { const value = process.env.OPS_ALERT_WEBHOOK_URL; if (value) { try { const u = new URL(value); if (u.protocol !== "https:" || u.username || u.password || ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return null; return { type: "webhook", url: u.href }; } catch { return null; } } if (isValidEmail(process.env.OPS_ALERT_EMAIL || "")) return { type: "email", to: process.env.OPS_ALERT_EMAIL }; return null; }
async function recordEvent({ kind, summary, requestId = "", method = "", route = "system", severity = "error", frames = [] }) {
  kind = /^[A-Z0-9_]{3,80}$/.test(kind || "") ? kind : "SERVER_ERROR";
  route = String(route).slice(0, 150); summary = String(summary).slice(0, 300);
  const key = crypto.createHash("sha256").update(kind + ":" + route + ":" + Math.floor(Date.now() / 3600000)).digest("hex");
  try { return await Event.findOneAndUpdate({ key }, { $setOnInsert: { kind, summary, method, route, severity, frames: frames.slice(0, 6), alertStatus: alertChannel() ? "queued" : "disabled", attempts: 0, nextAttemptAt: new Date() }, $set: { requestId, lastSeenAt: new Date(), status: "open" }, $inc: { count: 1 } }, { upsert: true, new: true }); }
  catch (e) { if (e.code === 11000) return Event.findOneAndUpdate({ key }, { $inc: { count: 1 }, $set: { lastSeenAt: new Date() } }, { new: true }); throw e; }
}
function captureError(error, req) {
  const route = typeof req.route?.path === "string" ? req.baseUrl + req.route.path : "unmatched-api-route";
  const frames = String(error.stack || "").split("\n").slice(1).map((v) => v.match(/(?:server[\\/])([^():]+\.js):(\d+):(\d+)/)).filter(Boolean).slice(0, 6).map((m) => m[1].replace(/\\/g, "/") + ":" + m[2] + ":" + m[3]);
  const kind = "HTTP_SERVER_ERROR", requestId = req.requestId || crypto.randomUUID();
  console.error(JSON.stringify({ level: "error", kind, requestId, method: req.method, route, frames }));
  return recordEvent({ kind, summary: "An API request failed. Inspect its request ID and safe source frames.", requestId, method: req.method, route, frames }).catch(() => {});
}
async function readiness() { try { const db = mongoose.connection.db; if (!db || !(await db.command({ ping: 1 })).ok) return { status: "unavailable" }; const gate = await require("../models/MaintenanceGate").findById("store"); return { status: gate?.mode === "backup" && +new Date(gate.expiresAt) > Date.now() ? "maintenance" : "ready" }; } catch { return { status: "unavailable" }; } }
async function status() {
  const ready = await readiness(), [lastBackups, openAlerts, failedEmails, unclearRefunds, uncertainParcels] = await Promise.all([BackupRun.find({}).sort({ createdAt: -1 }).limit(10), Event.countDocuments({ status: "open" }), require("../models/OrderNotification").countDocuments({ status: "failed" }), require("../models/Refund").countDocuments({ status: "unknown" }), require("../models/CourierBooking").countDocuments({ $or: [{ status: { $in: ["unknown", "cancel_unknown"] } }, { exceptionStatus: "open" }] })]);
  let freeDiskBytes = null; try { const disk = await fs.statfs(path.resolve(__dirname, "..")); freeDiskBytes = Number(disk.bavail) * Number(disk.bsize); } catch { /* Not supported on every host. */ }
  const cloud = require("./cloudinaryService").configuration(), courier = require("./ecourierService").configuration();
  let encryptionConfigured = false; try { require("./backupService").encryptionKey(); encryptionConfigured = true; } catch { /* An invalid/missing key is not ready for backups. */ }
  return { release: { version: require("../package.json").version, environment: process.env.NORDA_ENVIRONMENT || "local", commit: /^[a-f0-9]{40}$/.test(process.env.NORDA_RELEASE_SHA || "") ? process.env.NORDA_RELEASE_SHA : null }, readiness: ready.status, uptimeSeconds: Math.floor(process.uptime()), memoryBytes: process.memoryUsage().rss, freeDiskBytes, openAlerts, failedEmails, unclearRefunds, uncertainParcels, lastBackups, integrations: { courier: { provider: courier.provider, configured: courier.ready, mode: courier.mode, automaticBooking: courier.auto }, media: { storage: cloud.storage, configured: cloud.storage === "local" || cloud.ready }, backups: { encryptionConfigured, intervalHours: Number(process.env.BACKUP_INTERVAL_HOURS) || 0 }, alerts: { channel: alertChannel()?.type || "disabled" } } };
}
async function sendAlert(row) {
  const channel = alertChannel(); if (!channel) throw httpError(503, "Configure an operations alert channel first");
  const text = "NORDA operational alert\n" + row.kind + "\n" + row.summary + "\nSeverity: " + row.severity + "\nRequest ID: " + (row.requestId || "not applicable") + "\nRepeated events in this hour: " + row.count + "\nTime: " + new Date().toISOString();
  if (channel.type === "email") { const receipt = await require("./mailService").sendAccountMail({ to: channel.to, subject: "Norda operational alert: " + row.kind, text, kind: "operational_alert" }); return receipt?.delivery === "local" ? "file" : receipt?.delivery || "smtp"; }
  let u; try { u = new URL(channel.url); } catch { throw httpError(503, "Invalid alert destination"); }
  const response = await fetch(u.href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service: "norda", kind: row.kind, severity: row.severity, summary: row.summary, requestId: row.requestId || null, count: row.count, occurredAt: new Date().toISOString() }), signal: AbortSignal.timeout(10000), redirect: "error" });
  if (!response.ok) throw httpError(502, "Alert endpoint did not accept the notification"); return "webhook";
}
async function deliverAlerts() {
  if (!alertChannel()) return;
  const stale = await Event.find({ alertStatus: "sending", claimedAt: { $lt: new Date(Date.now() - 600000) } }).limit(20);
  for (const row of stale) await Event.updateOne({ _id: row._id, alertStatus: "sending" }, { $set: { alertStatus: row.attempts >= 5 ? "failed" : "queued", nextAttemptAt: new Date() } });
  const rows = await Event.find({ alertStatus: "queued", nextAttemptAt: { $lte: new Date() }, attempts: { $lt: 5 } }).sort({ createdAt: 1 }).limit(10);
  for (const row of rows) { const claimed = await Event.findOneAndUpdate({ _id: row._id, alertStatus: "queued" }, { $set: { alertStatus: "sending", claimedAt: new Date() }, $inc: { attempts: 1 } }, { new: true }); if (!claimed) continue; try { const transport = await sendAlert(claimed); await Event.updateOne({ _id: row._id, alertStatus: "sending" }, { $set: { alertStatus: "sent", alertTransport: transport, notifiedAt: new Date() } }); } catch { await Event.updateOne({ _id: row._id, alertStatus: "sending" }, { $set: { alertStatus: claimed.attempts >= 5 ? "failed" : "queued", nextAttemptAt: new Date(Date.now() + 60000 * 2 ** claimed.attempts) } }); } }
}
let lastOutageAlert = 0;
async function checkHealth() {
  const ready = await readiness();
  if (ready.status === "unavailable") { if (alertChannel() && Date.now() - lastOutageAlert > 3600000) { lastOutageAlert = Date.now(); await sendAlert({ kind: "DATABASE_UNAVAILABLE", summary: "Database readiness failed; the API needs operational attention.", severity: "error", count: 1 }).catch(() => {}); } return; }
  const d = await status();
  for (const [condition, kind, summary] of [[d.failedEmails > 0, "EMAIL_QUEUE_FAILED", "Store email messages exhausted their delivery retries."], [d.unclearRefunds > 0, "REFUND_RECONCILIATION_REQUIRED", "A refund has an unknown provider result; avoid duplicate submission."], [d.uncertainParcels > 0, "COURIER_REVIEW_REQUIRED", "A carrier booking or delivery exception needs review."], [d.freeDiskBytes !== null && d.freeDiskBytes < 512 * 1024 ** 2, "DISK_SPACE_LOW", "Less than 512 MiB is available for uploads/backups."], [d.lastBackups[0]?.status === "failed", "BACKUP_FAILED", "The most recent backup did not complete."], [Number(process.env.BACKUP_INTERVAL_HOURS) > 0 && !d.lastBackups.some((b) => b.status === "succeeded" && Date.now() - +new Date(b.completedAt) < Number(process.env.BACKUP_INTERVAL_HOURS) * 7200000), "BACKUP_STALE", "No recent successful scheduled backup was found."]]) if (condition) await recordEvent({ kind, summary, severity: "warning" });
}
async function maybeBackup() { const gate = await require("../models/MaintenanceGate").findById("store"); if (gate?.mode === "backup" && +new Date(gate.expiresAt) > Date.now()) return; const hours = Number(process.env.BACKUP_INTERVAL_HOURS); if (!Number.isFinite(hours) || hours <= 0) return; if (hours < 1 || hours > 720) throw httpError(503, "Backup interval must be 1 to 720 hours"); const last = await BackupRun.findOne({}).sort({ createdAt: -1 }); if (last && Date.now() - +new Date(last.startedAt || last.createdAt) < hours * 3600000) return; await require("./backupService").createBackup(); }
function startOperationsWorker() { let stopped = false, running; const tick = () => { if (stopped || running) return; running = (async () => { await checkHealth(); await deliverAlerts(); await maybeBackup().catch(() => recordEvent({ kind: "BACKUP_FAILED", summary: "Scheduled backup failed; check encryption configuration, disk space and media availability." }).catch(() => {})); })().catch(() => {}).finally(() => running = null); }; const timer = setInterval(tick, 60000); timer.unref(); tick(); return async () => { stopped = true; clearInterval(timer); if (running) await running; }; }
module.exports = { recordEvent, captureError, readiness, status, alertChannel, sendAlert, deliverAlerts, checkHealth, maybeBackup, startOperationsWorker };

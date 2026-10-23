const fs = require("node:fs/promises");
const { createReadStream, createWriteStream } = require("node:fs");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const mongoose = require("mongoose");
const { BSON } = mongoose.mongo;
const BackupRun = require("../models/BackupRun");
const { withBackupGate } = require("./maintenanceService");
const httpError = require("../utils/httpError");
const MAGIC = Buffer.from("NORDA_BACKUP_V1\n");
const EXCLUDED = new Set(["authsessions", "operationlocks", "maintenancegates", "operationalevents", "backupruns", "mfachallenges", "offsitebackups", "restoredrills"]);
const backupDirectory = () => path.resolve(process.env.BACKUP_DIRECTORY || path.join(__dirname, "../.backups"));
function encryptionKey() { const raw = process.env.BACKUP_ENCRYPTION_KEY || ""; if (!/^[a-zA-Z0-9+/]{43}=$/.test(raw) || Buffer.from(raw, "base64").length !== 32) throw httpError(503, "Configure your own 32-byte base64 BACKUP_ENCRYPTION_KEY before creating or restoring backups"); return Buffer.from(raw, "base64"); }
const digestFile = async (filename) => { const hash = crypto.createHash("sha256"); for await (const chunk of createReadStream(filename)) hash.update(chunk); return hash.digest("hex"); };
async function privateDirectory(dir) { await fs.mkdir(dir, { recursive: true, mode: 0o700 }); const s = await fs.lstat(dir); if (!s.isDirectory() || s.isSymbolicLink()) throw httpError(400, "Use a real private backup directory"); await fs.chmod(dir, 0o700); }
async function writeChunks(filename, chunks) { const h = await fs.open(filename, "wx", 0o600); try { for await (const chunk of chunks) await h.writeFile(chunk); } finally { await h.close(); } }
async function* rawDocuments(collection) { const cursor = collection.find({}, { raw: true }); try { for await (const doc of cursor) yield Buffer.isBuffer(doc) ? doc : BSON.serialize(doc); } finally { await cursor.close(); } }
async function addEntry(entries, stage, relative, kind, source) { const destination = path.join(stage, relative); await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 }); if (source !== destination) await fs.copyFile(source, destination); await fs.chmod(destination, 0o600); entries.push({ path: relative, kind, size: (await fs.stat(destination)).size, sha256: await digestFile(destination) }); }
async function mediaEntries(entries, stage, assertOwner) {
  const local = path.resolve(__dirname, "../uploads"), assets = path.resolve(__dirname, "../../client/assets");
  const walk = async (dir, prefix) => { for (const f of await fs.readdir(dir, { withFileTypes: true })) { if (f.name.startsWith(".")) continue; const source = path.join(dir, f.name); if (f.isSymbolicLink()) throw httpError(409, "A media symlink requires review before backup"); if (f.isDirectory()) await walk(source, prefix + "/" + f.name); else if (f.isFile()) { await assertOwner(); await addEntry(entries, stage, prefix + "/" + f.name, "media", source); } } };
  await walk(local, "media/local"); await walk(assets, "media/assets");
  const Upload = require("../models/Upload");
  const active = await Upload.find({ $or: [{ status: "active" }, { status: { $exists: false } }] }).lean();
  for (const a of active) {
    await assertOwner();
    if (a.storage !== "cloudinary") { const file = require("./mediaService").localPath(a.filename); if (!(await fs.stat(file).catch(() => null))?.isFile()) throw httpError(409, "A managed local image is missing; backup was not published"); continue; }
    const url = require("./cloudinaryService").secureCloudUrl(a.cloudUrl, a.cloudName); if (!url) throw httpError(409, "Invalid cloud media source");
    let response; try { response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "error" }); } catch { throw httpError(502, "Cloud image download failed; backup was not published"); }
    if (!response.ok || !response.body) throw httpError(502, "Cloud image download failed; backup was not published");
    const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[a.mimeType]; if (!extension) throw httpError(409, "Unsupported cloud image type in backup");
    const relative = "media/cloud/" + a._id + "." + extension, target = path.join(stage, relative); await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); let size = 0;
    async function* bounded() { for await (const chunk of response.body) { size += chunk.length; if (size > 5 * 1024 * 1024) throw httpError(409, "Cloud image exceeds the backup limit"); yield chunk; } }
    await writeChunks(target, bounded()); const sig = (await fs.readFile(target)).subarray(0, 12); if (require("../utils/imageSignature").detectImageMime(sig) !== a.mimeType) throw httpError(409, "Downloaded cloud image signature did not match");
    await addEntry(entries, stage, relative, "cloud", target); entries[entries.length - 1].uploadId = String(a._id); entries[entries.length - 1].cloudPublicId = a.cloudPublicId; entries[entries.length - 1].cloudUrl = a.cloudUrl;
  }
}
async function encryptBundle(stage, manifest, output, key) {
  const iv = crypto.randomBytes(12), header = Buffer.concat([MAGIC, iv]), cipher = crypto.createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(header);
  const json = Buffer.from(BSON.EJSON.stringify(manifest, { relaxed: false })); if (json.length > 16 * 1024 * 1024) throw httpError(413, "Backup manifest exceeds its limit"); const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(json.length));
  async function* contents() { yield length; yield json; for (const entry of manifest.entries) for await (const chunk of createReadStream(path.join(stage, entry.path))) yield chunk; }
  await fs.writeFile(output, header, { mode: 0o600, flag: "wx" });
  await pipeline(Readable.from(contents()), cipher, createWriteStream(output, { flags: "a", mode: 0o600 })); await fs.appendFile(output, cipher.getAuthTag());
}
async function createBackup() {
  const key = encryptionKey(), dir = backupDirectory(); await privateDirectory(dir);
  return withBackupGate(async (assertOwner) => {
    const run = await BackupRun.create({ status: "running", startedAt: new Date(), keyId: crypto.createHash("sha256").update(key).digest("hex").slice(0, 16) });
    const stage = await fs.mkdtemp(path.join(dir, ".stage-")), filename = "norda-backup-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + run._id + ".ndb", partial = path.join(dir, "." + filename + ".partial");
    try {
      const db = mongoose.connection.db; if (!db) throw httpError(503, "Database is unavailable");
      const collections = (await db.listCollections({}, { nameOnly: false }).toArray()).filter((c) => c.type === "collection" && !c.name.startsWith("system.") && !EXCLUDED.has(c.name)).sort((a, b) => a.name.localeCompare(b.name));
      const manifest = { format: 1, createdAt: new Date(), sourceDatabase: db.databaseName, excludedCollections: [...EXCLUDED], consistency: "Norda write leases drained; same-version Norda workers paused", collections: [], entries: [] };
      for (const [index, c] of collections.entries()) {
        await assertOwner(); const collection = db.collection(c.name), relative = "database/" + String(index).padStart(5, "0") + ".bson", target = path.join(stage, relative); await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); let count = 0;
        async function* chunks() { for await (const bytes of rawDocuments(collection)) { count++; yield bytes; } }
        await writeChunks(target, chunks()); await addEntry(manifest.entries, stage, relative, "bson", target);
        manifest.collections.push({ name: c.name, entry: relative, count, indexes: await collection.listIndexes().toArray(), options: c.options || {} });
      }
      await mediaEntries(manifest.entries, stage, assertOwner); if (manifest.entries.some((e) => !safeEntry(e))) throw httpError(409, "A media filename needs review before backup"); await assertOwner();
      await encryptBundle(stage, manifest, partial, key); await assertOwner(); await fs.rename(partial, path.join(dir, filename));
      const result = { status: "succeeded", filename, bytes: (await fs.stat(path.join(dir, filename))).size, collections: manifest.collections.length, documents: manifest.collections.reduce((s, c) => s + c.count, 0), mediaFiles: manifest.entries.filter((e) => e.kind !== "bson").length, completedAt: new Date() };
      await BackupRun.updateOne({ _id: run._id }, { $set: result }); return { _id: run._id, ...result };
    } catch (e) { await fs.unlink(partial).catch(() => {}); await BackupRun.updateOne({ _id: run._id }, { $set: { status: "failed", failureCode: "BACKUP_NOT_COMPLETED", completedAt: new Date() } }).catch(() => {}); throw e; }
    finally { await fs.rm(stage, { recursive: true, force: true }); }
  });
}
function safeEntry(entry) { return entry && typeof entry.path === "string" && entry.path.length < 500 && /^(?:database\/\d{5}\.bson|media\/(?:local|cloud|assets)\/[a-zA-Z0-9_./-]+)$/.test(entry.path) && !entry.path.split("/").some((p) => !p || p === "." || p === "..") && Number.isSafeInteger(entry.size) && entry.size >= 0 && entry.size <= 100 * 1024 ** 3 && /^[a-f0-9]{64}$/.test(entry.sha256); }
class Reader { constructor(stream) { this.iterator = stream[Symbol.asyncIterator](); this.buffer = Buffer.alloc(0); } async read(size) { const chunks = []; let left = size; while (left) { if (!this.buffer.length) { const next = await this.iterator.next(); if (next.done) throw httpError(400, "Backup payload is truncated"); this.buffer = next.value; } const n = Math.min(left, this.buffer.length); chunks.push(this.buffer.subarray(0, n)); this.buffer = this.buffer.subarray(n); left -= n; } return Buffer.concat(chunks, size); } async end() { if (this.buffer.length) return false; const next = await this.iterator.next(); if (next.done) return true; this.buffer = next.value; return false; } }
async function unpackBackup(file) {
  const key = encryptionKey(), info = await fs.lstat(file); if (!info.isFile() || info.isSymbolicLink() || info.size < MAGIC.length + 12 + 16 + 8) throw httpError(400, "Invalid backup file");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "norda-restore-")); await fs.chmod(root, 0o700);
  try {
    const h = await fs.open(file, "r"), header = Buffer.alloc(MAGIC.length + 12), tag = Buffer.alloc(16); try { await h.read(header, 0, header.length, 0); await h.read(tag, 0, 16, info.size - 16); } finally { await h.close(); }
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw httpError(400, "Unsupported backup format");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, header.subarray(MAGIC.length)); decipher.setAAD(header); decipher.setAuthTag(tag);
    const plain = path.join(root, ".verified-payload");
    try { await pipeline(createReadStream(file, { start: header.length, end: info.size - 17 }), decipher, createWriteStream(plain, { flags: "wx", mode: 0o600 })); } catch { throw httpError(400, "Backup authentication failed: incorrect key or damaged backup"); }
    const reader = new Reader(createReadStream(plain)), length = Number((await reader.read(8)).readBigUInt64BE()); if (!Number.isSafeInteger(length) || length < 2 || length > 16 * 1024 * 1024) throw httpError(400, "Invalid backup manifest");
    const manifest = BSON.EJSON.parse((await reader.read(length)).toString("utf8"), { relaxed: true });
    if (manifest.format !== 1 || !Array.isArray(manifest.entries) || manifest.entries.length > 100000 || !Array.isArray(manifest.collections) || manifest.collections.length > 10000 || manifest.entries.some((e) => !safeEntry(e)) || new Set(manifest.entries.map((e) => e.path)).size !== manifest.entries.length) throw httpError(400, "Invalid backup manifest entries");
    for (const entry of manifest.entries) {
      const target = path.join(root, entry.path); await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); const h = await fs.open(target, "wx", 0o600), hash = crypto.createHash("sha256"); let left = entry.size;
      try { while (left) { const chunk = await reader.read(Math.min(left, 65536)); await h.writeFile(chunk); hash.update(chunk); left -= chunk.length; } } finally { await h.close(); }
      if (hash.digest("hex") !== entry.sha256) throw httpError(400, "Backup file checksum mismatch");
    }
    if (!await reader.end()) throw httpError(400, "Unexpected data after the backup payload");
    for (const c of manifest.collections) {
      if (typeof c.name !== "string" || !c.name || c.name.length > 120 || c.name.startsWith("system.") || /[\u0000$]/.test(c.name) || !Number.isSafeInteger(c.count) || c.count < 0 || !manifest.entries.some((e) => e.path === c.entry && e.kind === "bson")) throw httpError(400, "Invalid collection manifest");
      let count = 0; for await (const doc of readBson(path.join(root, c.entry))) { if (!Object.hasOwn(doc, "_id")) throw httpError(400, "BSON document has no identity"); count++; } if (count !== c.count) throw httpError(400, "Backup document count mismatch");
    }
    if (new Set(manifest.collections.map((c) => c.name)).size !== manifest.collections.length) throw httpError(400, "Duplicate backup collections");
    await fs.unlink(plain); return { root, manifest };
  } catch (e) { await fs.rm(root, { recursive: true, force: true }); throw e; }
}
async function* readBson(file) { const reader = new Reader(createReadStream(file)); while (true) { if (await reader.end()) return; const head = await reader.read(4), size = head.readInt32LE(); if (size < 5 || size > 16 * 1024 * 1024) throw httpError(400, "Invalid BSON document size"); const bytes = Buffer.concat([head, await reader.read(size - 4)]); yield BSON.deserialize(bytes, { promoteLongs: false, promoteValues: false, bsonRegExp: true }); } }
async function verifyBackup(file) { const unpacked = await unpackBackup(path.resolve(file)); try { return { verified: true, collections: unpacked.manifest.collections.length, documents: unpacked.manifest.collections.reduce((s, c) => s + c.count, 0), mediaFiles: unpacked.manifest.entries.filter((e) => e.kind !== "bson").length }; } finally { await fs.rm(unpacked.root, { recursive: true, force: true }); } }
function indexSpecification(index) {
  const keys = ["key", "name", "unique", "sparse", "expireAfterSeconds", "partialFilterExpression", "collation", "hidden", "weights", "default_language", "language_override", "textIndexVersion", "2dsphereIndexVersion", "bits", "min", "max", "bucketSize", "wildcardProjection"];
  const spec = Object.fromEntries(keys.filter((k) => index[k] !== undefined).map((k) => [k, index[k]]));
  if (index.key?._fts === "text") { const logical = {}; for (const [field, direction] of Object.entries(index.key)) { if (field === "_fts") for (const textField of Object.keys(index.weights || {})) logical[textField] = "text"; else if (field !== "_ftsx") logical[field] = direction; } spec.key = logical; }
  return spec;
}
async function restoreUnlocked(file, { database, outputDirectory } = {}) {
  if (typeof database !== "string" || !/^norda_restore_[a-z0-9_]{8,60}$/.test(database) || database === mongoose.connection.name) throw httpError(400, "Restore only to a new isolated norda_restore_<unique-name> database");
  if (!outputDirectory) throw httpError(400, "Choose a new private restore output directory"); const output = path.resolve(outputDirectory);
  if (await fs.lstat(output).catch(() => null)) throw httpError(409, "Restore output already exists; nothing was overwritten");
  const client = mongoose.connection.getClient(), names = await client.db("admin").admin().listDatabases({ nameOnly: true, authorizedDatabases: true }); if (names.databases.some((d) => d.name === database)) throw httpError(409, "Restore database already exists; nothing was overwritten");
  const unpacked = await unpackBackup(path.resolve(file)), target = client.db(database); let created = false;
  try {
    for (const c of unpacked.manifest.collections) {
      const options = Object.fromEntries(["validator", "validationLevel", "validationAction", "collation", "capped", "size", "max"].filter((k) => c.options?.[k] !== undefined).map((k) => [k, c.options[k]]));
      await target.createCollection(c.name, options); created = true; const coll = target.collection(c.name); let batch = [], bytes = 0;
      for await (const doc of readBson(path.join(unpacked.root, c.entry))) { const n = BSON.calculateObjectSize(doc); if (batch.length && (batch.length >= 100 || bytes + n > 8 * 1024 * 1024)) { await coll.insertMany(batch); batch = []; bytes = 0; } batch.push(doc); bytes += n; }
      if (batch.length) await coll.insertMany(batch);
      for (const index of c.indexes || []) if (index.name !== "_id_") { const spec = indexSpecification(index); await coll.createIndexes([spec]); }
      if (await coll.countDocuments({}) !== c.count) throw httpError(409, "Restored document count did not match");
    }
    await fs.mkdir(output, { recursive: false, mode: 0o700 });
    for (const e of unpacked.manifest.entries.filter((e) => e.kind !== "bson")) { const destination = path.join(output, e.path); await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 }); await fs.copyFile(path.join(unpacked.root, e.path), destination, require("node:fs").constants.COPYFILE_EXCL); await fs.chmod(destination, 0o600); }
    await fs.writeFile(path.join(output, "restore-manifest.json"), BSON.EJSON.stringify(unpacked.manifest, { relaxed: false }), { mode: 0o600, flag: "wx" });
    return { restored: true, database, outputDirectory: output, collections: unpacked.manifest.collections.length, documents: unpacked.manifest.collections.reduce((s, c) => s + c.count, 0) };
  } catch (e) { if (created) await target.dropDatabase().catch(() => {}); throw e; }
  finally { await fs.rm(unpacked.root, { recursive: true, force: true }); }
}
async function restoreBackup(file, options = {}) { if (typeof options.database !== "string" || !/^norda_restore_[a-z0-9_]{8,60}$/.test(options.database)) throw httpError(400, "Restore only to a new isolated norda_restore_<unique-name> database"); return require("./operationLock").withOperationLock("restore:" + options.database, () => restoreUnlocked(file, options)); }
module.exports = { indexSpecification, createBackup, verifyBackup, restoreBackup, unpackBackup, encryptBundle, readBson, safeEntry, encryptionKey, backupDirectory, EXCLUDED };

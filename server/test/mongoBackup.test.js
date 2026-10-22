const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const mongoose = require("mongoose");
const uri = process.env.NORDA_TEST_MONGO_URI;
test("Real MongoDB: encrypted BSON/media backup, authenticated verification and isolated restore", { skip: !uri, timeout: 180000 }, async (t) => {
  process.env.NODE_ENV = "test"; const root = await fs.mkdtemp(path.join(os.tmpdir(), "norda-backup-test-")), key = crypto.randomBytes(32).toString("base64"), dbName = "norda_test_" + crypto.randomBytes(8).toString("hex"), restored = "norda_restore_" + crypto.randomBytes(8).toString("hex");
  process.env.BACKUP_DIRECTORY = path.join(root, "archives"); process.env.BACKUP_ENCRYPTION_KEY = key;
  const originalFetch = global.fetch; const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm6kAAAAASUVORK5CYII=", "base64"); const localName = "backup-" + crypto.randomUUID() + ".png", localPath = path.resolve(__dirname, "../uploads", localName);
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 }); require("../app"); const backup = require("../services/backupService"), { BSON } = mongoose.mongo;
  let file;
  try {
    await Promise.all(Object.values(mongoose.models).map((M) => M.init())); const user = await mongoose.models.User.create({ name: "Backup user", email: "backup@example.com", password: "BackupPassword123" });
    await fs.writeFile(localPath, png);
    await mongoose.models.Upload.create({ uploadedBy: user._id, originalName: "local.png", filename: localName, url: "/uploads/" + localName, mimeType: "image/png", size: png.length, storage: "local", status: "active" });
    const publicId = "norda/uploads/" + crypto.randomUUID(), cloudUrl = "https://res.cloudinary.com/norda-tests/image/upload/v1/" + publicId + ".png";
    await mongoose.models.Upload.create({ uploadedBy: user._id, originalName: "cloud.png", filename: "cloud-" + crypto.randomUUID() + ".png", url: cloudUrl, cloudUrl, cloudName: "norda-tests", cloudPublicId: publicId, cloudAssetId: "backup-asset", mimeType: "image/png", size: png.length, storage: "cloudinary", status: "active" });
    global.fetch = async (url, options) => String(url) === cloudUrl ? new Response(png, { status: 200, headers: { "Content-Type": "image/png" } }) : originalFetch(url, options);
    const fixtures = mongoose.connection.db.collection("bsonfixtures"); await fixtures.insertOne({ _id: new BSON.ObjectId(), long: BSON.Long.fromString("9223372036854775800"), int: new BSON.Int32(7), double: new BSON.Double(3.25), money: BSON.Decimal128.fromString("1234.567890123456789"), date: new Date("2026-01-01T00:00:00Z"), binary: new BSON.Binary(Buffer.from([1, 2, 3])), regex: new BSON.BSONRegExp("^test", "i") }); await fixtures.createIndex({ int: 1 }, { unique: true, name: "unique_integer" });
    await t.test("Create drains writes, captures BSON/indexes/local and cloud bytes, and publishes encrypted data", async () => {
      const result = await backup.createBackup(); assert.equal(result.status, "succeeded"); assert.ok(result.collections >= 3); assert.ok(result.mediaFiles >= 2); file = path.join(process.env.BACKUP_DIRECTORY, result.filename); const bytes = await fs.readFile(file); assert.doesNotMatch(bytes.toString("latin1"), /backup@example.com|BackupPassword123|bsonfixtures/); assert.equal((await mongoose.models.MaintenanceGate.findById("store")).mode, "open"); assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
      const verified = await backup.verifyBackup(file); assert.equal(verified.verified, true); assert.equal(verified.documents, result.documents);
    });
    await t.test("Wrong keys and a modified ciphertext fail authentication before any restore", async () => {
      process.env.BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64"); await assert.rejects(backup.verifyBackup(file), /authentication failed/); process.env.BACKUP_ENCRYPTION_KEY = key;
      const bad = path.join(root, "tampered.ndb"), bytes = await fs.readFile(file); bytes[Math.floor(bytes.length / 2)] ^= 1; await fs.writeFile(bad, bytes); await assert.rejects(backup.verifyBackup(bad), /authentication failed/);
    });
    await t.test("Isolated restore preserves BSON types, user password hashes, indexes and media checksums", async () => {
      const output = path.join(root, "restored-media"), result = await backup.restoreBackup(file, { database: restored, outputDirectory: output }); assert.equal(result.restored, true); const db = mongoose.connection.getClient().db(restored), sourceDoc = await fixtures.findOne({}, { promoteLongs: false, promoteValues: false, bsonRegExp: true }), targetDoc = await db.collection("bsonfixtures").findOne({}, { promoteLongs: false, promoteValues: false, bsonRegExp: true }); assert.equal(BSON.EJSON.stringify(sourceDoc, { relaxed: false }), BSON.EJSON.stringify(targetDoc, { relaxed: false }));
      const originalUser = await mongoose.models.User.findById(user._id).select("+password"), restoredUser = await db.collection("users").findOne({ _id: user._id }); assert.equal(restoredUser.password, originalUser.password); assert.ok((await db.collection("bsonfixtures").indexes()).some((i) => i.name === "unique_integer" && i.unique)); await assert.rejects(db.collection("bsonfixtures").insertOne({ int: new BSON.Int32(7) }), (e) => e.code === 11000);
      assert.deepEqual(await fs.readFile(path.join(output, "media/local", localName)), png); const cloudFiles = await fs.readdir(path.join(output, "media/cloud")); assert.equal(cloudFiles.length, 1); assert.deepEqual(await fs.readFile(path.join(output, "media/cloud", cloudFiles[0])), png); assert.equal((await mongoose.connection.db.collection("users").findOne({ _id: user._id })).email, "backup@example.com");
    });
    await t.test("Restore refuses existing/source databases and existing output folders", async () => {
      await assert.rejects(backup.restoreBackup(file, { database: restored, outputDirectory: path.join(root, "other") }), /already exists/); await assert.rejects(backup.restoreBackup(file, { database: dbName, outputDirectory: path.join(root, "other2") }), /isolated/); await assert.rejects(backup.restoreBackup(file, { database: "norda_restore_" + crypto.randomBytes(8).toString("hex"), outputDirectory: path.join(root, "restored-media") }), /already exists/);
    });
    await t.test("A missing managed image fails the backup and releases maintenance without publishing a success", async () => {
      await fs.unlink(localPath); const before = await mongoose.models.BackupRun.countDocuments({ status: "succeeded" }); await assert.rejects(backup.createBackup(), /missing/); assert.equal(await mongoose.models.BackupRun.countDocuments({ status: "succeeded" }), before); assert.equal((await mongoose.models.MaintenanceGate.findById("store")).mode, "open"); const dirs = await fs.readdir(process.env.BACKUP_DIRECTORY); assert.ok(!dirs.some((f) => f.startsWith(".stage-")));
    });
  } finally { global.fetch = originalFetch; await fs.unlink(localPath).catch(() => {}); await mongoose.connection.getClient().db(restored).dropDatabase().catch(() => {}); if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); await fs.rm(root, { recursive: true, force: true }); delete process.env.BACKUP_ENCRYPTION_KEY; delete process.env.BACKUP_DIRECTORY; }
});

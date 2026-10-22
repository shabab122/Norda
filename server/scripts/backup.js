require("dotenv").config();
require("dotenv").config({ path: require("node:path").resolve(__dirname, "..", ".env.integrations") });
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const service = require("../services/backupService");
const option = (name) => { const index = process.argv.indexOf("--" + name); return index >= 0 ? process.argv[index + 1] : undefined; };
(async () => {
  const mode = process.argv[2];
  if (!["create", "verify", "restore"].includes(mode)) throw new Error("Choose create, verify or restore");
  if (mode !== "verify") await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const result = mode === "create" ? await service.createBackup() : mode === "verify" ? await service.verifyBackup(option("file")) : await service.restoreBackup(option("file"), { database: option("database") || "norda_restore_" + crypto.randomBytes(8).toString("hex"), outputDirectory: option("output") });
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => { console.error(e.statusCode ? e.message : "Backup operation failed. Check file/key permissions, database access and disk space. No production database was selected for restore."); process.exitCode = 1; }).finally(() => mongoose.disconnect());

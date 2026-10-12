const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const destination = path.join(__dirname, "../.env");
if (fs.existsSync(destination)) {
  console.log("Existing server/.env kept. Review its MongoDB URL and admin credentials before starting.");
} else {
  const template = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");
  const content = template.replace(/^JWT_SECRET=.*$/m, "JWT_SECRET=" + crypto.randomBytes(32).toString("hex"))
    .replace(/^ADMIN_PASSWORD=.*$/m, "ADMIN_PASSWORD=" + crypto.randomBytes(18).toString("base64url"));
  fs.writeFileSync(destination, content, { mode: 0o600 });
  console.log("Created server/.env with unique credentials. Open it to set MONGO_URI and read ADMIN_EMAIL/ADMIN_PASSWORD for the seeded admin.");
}

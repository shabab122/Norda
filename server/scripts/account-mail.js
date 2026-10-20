require("dotenv").config();
const fs = require("node:fs/promises");
const path = require("node:path");
const { checkMailConfiguration, localMailDirectory } = require("../services/mailService");

async function main() {
  if (process.argv.includes("--check")) {
    const mode = await checkMailConfiguration();
    console.log(mode === "smtp" ? "SMTP connection and authentication passed. Send a verification email to check inbox delivery." : "Local email preview is enabled. Run npm run mail:preview after requesting an account email. Configure SMTP to deliver to an inbox.");
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Local email preview is disabled in production");
  const recipient = process.argv.find((value, index) => index > 1 && value.includes("@"))?.toLowerCase();
  const files = await fs.readdir(localMailDirectory()).catch((error) => { if (error.code === "ENOENT") return []; throw error; });
  const messages = [];
  for (const name of files.filter((value) => /^[\d-]+-[a-f\d]+\.json$/.test(value)).sort().reverse()) {
    const message = JSON.parse(await fs.readFile(path.join(localMailDirectory(), name), "utf8"));
    if (Date.now() - new Date(message.createdAt).getTime() <= 86400000 && (!recipient || message.to.toLowerCase() === recipient)) messages.push(message);
    if (messages.length === 5) break;
  }
  if (!messages.length) { console.log("No recent local account emails. Request a reset or verification link first."); return; }
  console.log("Private local email preview. Do not share or commit these one-use links.\n");
  for (const message of messages) console.log("To: " + message.to + "\nSubject: " + message.subject + "\nSent: " + message.createdAt + "\n\n" + message.text + "\n");
}
main().catch((error) => { console.error(error.message.startsWith("Local email") ? error.message : "Email check failed. Review MAIL_TRANSPORT, SMTP settings and docs/ACCOUNT_RECOVERY.md."); process.exitCode = 1; });

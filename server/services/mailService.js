const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");
const { isValidEmail } = require("../utils/validation");
const httpError = require("../utils/httpError");

const localMailDirectory = () => path.join(__dirname, "../.local-mail");

function mailConfiguration() {
  const mode = process.env.MAIL_TRANSPORT || "auto";
  if (!["auto", "smtp", "file"].includes(mode)) throw httpError(503, "Email service configuration needs attention");
  const transport = mode === "auto" ? (process.env.SMTP_HOST ? "smtp" : "file") : mode;
  if (transport === "file") {
    if (process.env.NODE_ENV === "production") throw httpError(503, "Configure SMTP to use account email in production");
    return { transport, from: "Norda <no-reply@norda.local>" };
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || (process.env.SMTP_SECURE === undefined && port === 465);
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || "";
  const mailbox = from.match(/<([^<>]+)>$/)?.[1] || from;
  if (!process.env.SMTP_HOST || !Number.isInteger(port) || port < 1 || port > 65535 || !isValidEmail(mailbox) || /[\r\n]/.test(from)) throw httpError(503, "Configure SMTP_HOST, SMTP_PORT and MAIL_FROM for account email");
  if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASS)) throw httpError(503, "SMTP_USER and SMTP_PASS must be configured together");
  return {
    transport, from,
    options: {
      host: process.env.SMTP_HOST, port, secure,
      // Local mail catchers may use plain SMTP. Real deployments require TLS.
      requireTLS: process.env.NODE_ENV === "production" && !secure,
      ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } } : {}),
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true,
    },
  };
}

async function sendAccountMail({ to, subject, text, kind, actionUrl, messageId }) {
  const config = mailConfiguration();
  if (config.transport === "file") {
    const directory = localMailDirectory();
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700);
    // Bound the local preview mailbox and retain no messages older than a day.
    const entries = (await fs.readdir(directory)).filter((name) => /^[\d-]+-[a-f\d]+\.json$/.test(name)).sort().reverse();
    for (const name of entries.slice(99)) await fs.unlink(path.join(directory, name)).catch(() => {});
    for (const name of entries.slice(0, 99)) {
      const file = path.join(directory, name);
      const stat = await fs.stat(file).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
      if (stat && Date.now() - stat.mtimeMs > 86400000) await fs.unlink(file).catch(() => {});
    }
    const file = path.join(directory, Date.now() + "-" + crypto.randomBytes(8).toString("hex") + ".json");
    await fs.writeFile(file, JSON.stringify({ to, subject, text, kind, actionUrl, messageId, createdAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    return { delivery: "local" };
  }
  const result = await nodemailer.createTransport(config.options).sendMail({ from: config.from, to, subject, text, ...(messageId ? { messageId } : {}) });
  if (!result.accepted?.length) throw httpError(503, "Email service did not accept the message");
  return { delivery: "smtp" };
}

async function checkMailConfiguration() {
  const config = mailConfiguration();
  if (config.transport === "smtp") await nodemailer.createTransport(config.options).verify();
  return config.transport;
}

module.exports = { checkMailConfiguration, localMailDirectory, mailConfiguration, sendAccountMail };

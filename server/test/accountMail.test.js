const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const mail = require("../services/mailService");
const { accountActionUrl } = require("../services/accountRecoveryService");

test("Account email links use the configured origin, fragments and production HTTPS", () => {
  const old = { NODE_ENV: process.env.NODE_ENV, CLIENT_APP_URL: process.env.CLIENT_APP_URL };
  try {
    process.env.NODE_ENV = "test"; process.env.CLIENT_APP_URL = "http://localhost:5000";
    const token = crypto.randomBytes(32).toString("hex");
    const url = new URL(accountActionUrl("reset", token));
    assert.equal(url.origin, "http://localhost:5000"); assert.equal(url.pathname, "/reset-password.html"); assert.equal(url.search, ""); assert.equal(url.hash, "#token=" + token);
    process.env.NODE_ENV = "production"; assert.throws(() => accountActionUrl("reset", token), /HTTPS/);
    for (const base of ["javascript:alert(1)", "https://user:password@store.example", "https://store.example?forward=other", "https://store.example#bad"]) { process.env.CLIENT_APP_URL = base; assert.throws(() => accountActionUrl("verify", token)); }
    process.env.CLIENT_APP_URL = "https://store.example"; assert.equal(new URL(accountActionUrl("verify", token)).pathname, "/verify-email.html");
  } finally { for (const [key, value] of Object.entries(old)) value === undefined ? delete process.env[key] : process.env[key] = value; }
});

test("Private local preview creates a restricted server-only message and is disabled in production", async () => {
  const old = { NODE_ENV: process.env.NODE_ENV, MAIL_TRANSPORT: process.env.MAIL_TRANSPORT };
  const marker = "mail-test-" + crypto.randomUUID();
  let created;
  try {
    process.env.NODE_ENV = "test"; process.env.MAIL_TRANSPORT = "file";
    await mail.sendAccountMail({ to: "preview-test@norda.example", subject: marker, text: "Test notification", kind: "test" });
    for (const name of await fs.readdir(mail.localMailDirectory())) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(mail.localMailDirectory(), name);
      if (JSON.parse(await fs.readFile(file, "utf8")).subject === marker) { created = file; break; }
    }
    assert.ok(created); assert.equal((await fs.stat(created)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(mail.localMailDirectory())).mode & 0o777, 0o700);
    process.env.NODE_ENV = "production";
    assert.throws(() => mail.mailConfiguration(), /SMTP/);
  } finally {
    if (created) await fs.unlink(created);
    for (const [key, value] of Object.entries(old)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test("SMTP configuration verifies and delivers an actual message to an isolated SMTP listener", async () => {
  const keys = ["NODE_ENV", "MAIL_TRANSPORT", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const received = []; const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket); socket.once("close", () => sockets.delete(socket));
    let buffer = "", data = false, lines = [];
    socket.setEncoding("utf8"); socket.write("220 localhost Test SMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") { received.push(lines.join("\r\n")); data = false; lines = []; socket.write("250 Message accepted\r\n"); }
          else lines.push(line);
        } else if (/^EHLO|^HELO/i.test(line)) socket.write("250-localhost\r\n250 SIZE 1000000\r\n");
        else if (/^DATA$/i.test(line)) { data = true; socket.write("354 Send message\r\n"); }
        else if (/^QUIT$/i.test(line)) socket.end("221 Bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    process.env.NODE_ENV = "test"; process.env.MAIL_TRANSPORT = "smtp"; process.env.SMTP_HOST = "127.0.0.1"; process.env.SMTP_PORT = String(server.address().port); process.env.SMTP_SECURE = "false"; process.env.MAIL_FROM = "Norda <accounts@norda.example>";
    delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
    assert.equal(await mail.checkMailConfiguration(), "smtp");
    assert.equal((await mail.sendAccountMail({ to: "buyer@norda.example", subject: "Norda verification test", text: "Confirm your account using the one-use link." })).delivery, "smtp");
    assert.equal(received.length, 1); assert.match(received[0], /To: buyer@norda.example/); assert.match(received[0], /Subject: Norda verification test/);
    await mail.sendAccountMail({ to: "buyer@norda.example", subject: "Norda order confirmation", text: "Order confirmed. SKU NOR-FOREST-M, quantity 2.", kind: "order_confirmation", messageId: "<norda-order-integration@norda.example>" });
    assert.equal(received.length, 2); assert.match(received[1], /Message-ID: <norda-order-integration@norda.example>/i); assert.match(received[1], /NOR-FOREST-M/);
    process.env.NODE_ENV = "production";
    assert.equal(mail.mailConfiguration().options.requireTLS, true);
    await assert.rejects(mail.checkMailConfiguration());
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(old)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

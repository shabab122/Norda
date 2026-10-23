const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const mail = require("../services/mailService");

// A disposable loopback SMTP receiver exercises Nodemailer itself. It never
// relays messages or accesses the owner's SMTP account or inbox.
async function receiver() {
  const messages = [], sockets = new Set();
  let reject = false;
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    let buffer = "", data = false, lines = [];
    socket.setEncoding("utf8"); socket.write("220 norda-fixture ESMTP\r\n");
    socket.on("error", () => {});
    socket.on("data", chunk => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") { messages.push(lines.join("\r\n")); lines = []; data = false; socket.write("250 2.0.0 captured locally\r\n"); }
          else lines.push(line.startsWith("..") ? line.slice(1) : line);
        } else if (/^(EHLO|HELO)\b/i.test(line)) socket.write("250-norda-fixture\r\n250 SIZE 1048576\r\n");
        else if (line === "STARTTLS") socket.write("454 4.7.0 TLS unavailable in this local fixture\r\n");
        else if (/^MAIL FROM:/i.test(line)) socket.write("250 2.1.0 sender accepted\r\n");
        else if (/^RCPT TO:/i.test(line)) socket.write(reject ? "550 5.1.1 fixture recipient rejected\r\n" : "250 2.1.5 recipient accepted\r\n");
        else if (line === "DATA") { data = true; socket.write("354 end with dot\r\n"); }
        else if (line === "QUIT") socket.end("221 2.0.0 bye\r\n");
        else socket.write("250 2.0.0 ok\r\n");
      }
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { messages, port: server.address().port, reject: () => { reject = true; }, close: async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}

test("Real SMTP protocol accepts account/operational mail and rejects failed recipients without pretending delivery", { timeout: 15000 }, async t => {
  const smtp = await receiver(), oldEnv = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "test", MAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.port), SMTP_SECURE: "false", SMTP_USER: "", SMTP_PASS: "", MAIL_FROM: "Norda <sender@example.test>", OPS_ALERT_EMAIL: "operator@example.test" });
  delete process.env.OPS_ALERT_WEBHOOK_URL;
  try {
    await t.test("Configuration verification performs an actual SMTP greeting", async () => {
      assert.equal(await mail.checkMailConfiguration(), "smtp"); assert.equal(smtp.messages.length, 0);
    });
    await t.test("Account mail passes through Nodemailer with the original action link", async () => {
      const actionUrl = "https://store.example.test/verify-email.html#fixture-token";
      assert.deepEqual(await mail.sendAccountMail({ to: "buyer@example.test", subject: "Verify your Norda account", text: "Verify your email: " + actionUrl, kind: "verification", actionUrl }), { delivery: "smtp" });
      assert.equal(smtp.messages.length, 1); assert.match(smtp.messages[0], /buyer@example\.test/);
      // MIME quoted-printable may wrap a long URL using a soft line break.
      assert.match(smtp.messages[0].replace(/=\r\n/g, ""), /verify-email\.html#fixture-token/);
    });
    await t.test("Operations alert uses the same working SMTP transport", async () => {
      const transport = await require("../services/operationsService").sendAlert({ kind: "ACCEPTANCE_TEST", summary: "Isolated local acceptance alert", severity: "warning", requestId: "fixture-request", count: 1 });
      assert.equal(transport, "smtp"); assert.equal(smtp.messages.length, 2); assert.match(smtp.messages[1], /operator@example\.test/); assert.match(smtp.messages[1], /ACCEPTANCE_TEST/);
    });
    await t.test("Independent uptime alert reaches SMTP without connecting application MongoDB", async () => {
      delete process.env.MONITOR_ALERT_WEBHOOK_URL;
      process.env.MONITOR_ALERT_EMAIL = "monitor@example.test";
      await require("../../ops/uptime").notify("acceptance-store", { phase: "down", alertKind: "DOWN", checkedAt: Date.now() });
      assert.equal(smtp.messages.length, 3); assert.match(smtp.messages[2], /monitor@example\.test/); assert.match(smtp.messages[2], /DOWN/);
    });
    await t.test("Rejected delivery is an error rather than a successful email receipt", async () => {
      smtp.reject();
      await assert.rejects(mail.sendAccountMail({ to: "rejected@example.test", subject: "Rejected fixture", text: "Must not be delivered", kind: "verification" }));
      assert.equal(smtp.messages.length, 3);
    });
    await t.test("Production SMTP refuses a receiver that cannot provide required TLS", async () => {
      process.env.NODE_ENV = "production";
      await assert.rejects(mail.checkMailConfiguration(), error => error.code === "ETLS");
      assert.equal(smtp.messages.length, 3);
    });
  } finally {
    await smtp.close();
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  }
});

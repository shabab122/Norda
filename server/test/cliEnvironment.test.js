const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { loadCliEnvironment } = require("../config/cliEnvironment");
const { describeConfig } = require("../scripts/acceptance-preflight");

test("Acceptance CLI recognizes optional gateway/mail configuration without overwriting working credentials", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "norda-cli-environment-"));
  const baseFile = path.join(directory, ".env");
  const integrationsFile = path.join(directory, ".env.integrations");
  const base = "MONGO_URI=mongodb://127.0.0.1:27018/unchanged\nJWT_SECRET=" + "b".repeat(40) + "\nSMTP_USER=base-mailbox@example.test\n";
  const integrations = "MONGO_URI=mongodb://unwanted.example.test/other\nJWT_SECRET=unwanted-replacement\nSMTP_USER=integration-mailbox@example.test\nSMTP_HOST=mail.example.test\nSSLCOMMERZ_STORE_ID=fixture-store\nSSLCOMMERZ_STORE_PASSWORD=fixture-password\n";
  try {
    await fs.writeFile(baseFile, base);
    await fs.writeFile(integrationsFile, integrations);
    const env = { CLIENT_APP_URL: "https://store.example.test", SERVER_URL: "https://store.example.test", JWT_SECRET: "e".repeat(40) };
    loadCliEnvironment({ baseFile, integrationsFile, env });
    assert.equal(env.MONGO_URI, "mongodb://127.0.0.1:27018/unchanged");
    assert.equal(env.JWT_SECRET, "e".repeat(40));
    assert.equal(env.SMTP_USER, "base-mailbox@example.test");
    assert.equal(env.SMTP_HOST, "mail.example.test");
    assert.equal(describeConfig(env).gatewayCredentialsPresent, true);
    assert.doesNotMatch(JSON.stringify(describeConfig(env)), /fixture-password|fixture-store/);
    assert.equal(await fs.readFile(baseFile, "utf8"), base);
    assert.equal(await fs.readFile(integrationsFile, "utf8"), integrations);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("Missing optional integration file leaves local development credentials and modes intact", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "norda-cli-local-"));
  try {
    const env = { MONGO_URI: "mongodb://127.0.0.1:27017/unchanged", MAIL_TRANSPORT: "file" };
    const before = JSON.stringify(env);
    loadCliEnvironment({ baseFile: path.join(directory, ".env"), integrationsFile: path.join(directory, ".env.integrations"), env });
    assert.equal(JSON.stringify(env), before);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

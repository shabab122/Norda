const test = require("node:test");
const assert = require("node:assert/strict");
process.env.NODE_ENV = "test"; process.env.MAIL_TRANSPORT = "file"; process.env.CLIENT_APP_URL = "http://localhost:5000";
const { installMemoryStore } = require("../test-support/memoryStore");
const store = installMemoryStore();
const mail = require("../services/mailService");
const recovery = require("../services/accountRecoveryService");
const { mutateAddressBook } = require("../services/addressBookService");
const original = mail.sendAccountMail;
const tokenFrom = (message) => new URLSearchParams(new URL(message.actionUrl).hash.slice(1)).get("token");

test("Recovery mail and database failures leave credentials and retry paths intact", async (t) => {
  const user = await store.models.User.create({ name: "Failure customer", email: "failure@norda.example", password: "OriginalPassword123", emailVerifiedAt: null });
  const before = store.get("User", user._id).password;
  const messages = [];
  try {
    await t.test("Delivery failure clears only its pending link and permits an immediate retry", async () => {
      mail.sendAccountMail = async () => { const error = new Error("Private provider failure"); error.code = "ECONNREFUSED"; throw error; };
      await assert.rejects(recovery.issueAccountLink(user.email, "reset"), /Email could not be sent/);
      assert.equal(store.get("User", user._id).passwordResetHash, undefined); assert.equal(store.get("User", user._id).password, before);
      mail.sendAccountMail = async (message) => { messages.push(message); return { delivery: "local" }; };
      await recovery.issueAccountLink(user.email, "reset"); assert.ok(messages.length);
    });
    await t.test("A failed atomic reset write does not consume the token or change the password", async () => {
      const token = tokenFrom(messages.at(-1));
      store.fail("User", "findOneAndUpdate");
      await assert.rejects(recovery.resetAccountPassword(token, "RecoveredPassword123", "RecoveredPassword123"), /Injected/);
      assert.equal(store.get("User", user._id).password, before);
      await recovery.resetAccountPassword(token, "RecoveredPassword123", "RecoveredPassword123");
      assert.notEqual(store.get("User", user._id).password, before);
    });
    await t.test("A delayed failed email cannot remove a newer recovery link", async () => {
      let reject;
      mail.sendAccountMail = async () => new Promise((resolve, fail) => { reject = fail; });
      const pending = recovery.issueAccountLink(user.email, "reset");
      const failure = assert.rejects(pending, /Email could not be sent/);
      await new Promise((resolve) => setImmediate(resolve));
      await store.models.User.updateOne({ _id: user._id }, { $set: { passwordResetRequestedAt: new Date(Date.now() - 61000) } });
      mail.sendAccountMail = async (message) => { messages.push(message); return { delivery: "local" }; };
      await recovery.issueAccountLink(user.email, "reset");
      const hash = recovery.tokenHash(tokenFrom(messages.at(-1)));
      reject(new Error("Delayed SMTP failure")); await failure;
      assert.equal(store.get("User", user._id).passwordResetHash, hash);
    });
    await t.test("Failed address persistence releases the lock without changing saved addresses", async () => {
      const address = { label: "Home", line1: "Road", city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678" };
      store.fail("User", "findOneAndUpdate");
      await assert.rejects(mutateAddressBook(user._id, "add", undefined, address), /Injected/);
      assert.equal(store.get("User", user._id).addresses, undefined);
      assert.equal(store.records.OperationLock.size, 0);
      assert.equal((await mutateAddressBook(user._id, "add", undefined, address)).addresses.length, 1);
    });
  } finally { mail.sendAccountMail = original; store.restore(); }
});

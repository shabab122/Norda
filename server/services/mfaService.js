const crypto = require("node:crypto");
const User = require("../models/User"), Challenge = require("../models/MfaChallenge");
const { withOperationLock } = require("./operationLock");
const { withDatabaseUnit, querySession } = require("./databaseUnit");
const { patch } = require("./orderOperationStore");
const httpError = require("../utils/httpError");
const fields = "+password +mfaSecret +mfaPendingSecret +mfaPendingExpiresAt +mfaRecoveryHashes +mfaLastStep";
const update = (user, fields, unit) => patch(User, user, fields, unit, { $and: [ { $or: [{ tokenVersion: user.tokenVersion || 0 }, ...(!user.tokenVersion ? [{ tokenVersion: { $exists: false } }] : [])] }, { $or: [{ mfaRevision: user.mfaRevision || 0 }, ...(!user.mfaRevision ? [{ mfaRevision: { $exists: false } }] : [])] } ] });
const hash = v => crypto.createHash("sha256").update(String(v)).digest("hex");
function key() { const value = process.env.MFA_ENCRYPTION_KEY || ""; if (!/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, "base64").length !== 32) throw httpError(503, "Configure a separate 32-byte base64 MFA_ENCRYPTION_KEY to manage authenticator security"); return Buffer.from(value, "base64"); }
function seal(value, user) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv); c.setAAD(Buffer.from("norda:mfa:" + user)); return Buffer.concat([iv, c.update(value, "utf8"), c.final(), c.getAuthTag()]).toString("base64"); }
function open(value, user) { try { const b = Buffer.from(value, "base64"), c = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12)); c.setAAD(Buffer.from("norda:mfa:" + user)); c.setAuthTag(b.subarray(-16)); return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString("utf8"); } catch { throw httpError(503, "Authenticator configuration needs administrator attention; use a recovery code if available"); } }
function base32(bytes) { const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, value = 0, result = ""; for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { bits -= 5; result += alphabet[(value >>> bits) & 31]; } } if (bits) result += alphabet[(value << (5 - bits)) & 31]; return result; }
function decode(value) { if (!/^[A-Z2-7]{16,128}$/.test(value)) throw Error("Invalid authenticator secret"); let bits = 0, acc = 0; const result = []; for (const c of value) { acc = (acc << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c); bits += 5; if (bits >= 8) { bits -= 8; result.push((acc >>> bits) & 255); } } return Buffer.from(result); }
function totp(secret, time = Date.now(), digits = 6) { const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000))); const mac = crypto.createHmac("sha1", decode(secret)).update(counter).digest(), offset = mac[mac.length - 1] & 15; return String((mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0"); }
function matchStep(secret, code, last = -1) { if (typeof code !== "string" || !/^\d{6}$/.test(code)) return null; const step = Math.floor(Date.now() / 30000); for (const s of [step, step - 1, step + 1]) if (s > last && crypto.timingSafeEqual(Buffer.from(totp(secret, s * 30000)), Buffer.from(code))) return s; return null; }
function recoveryCodes() { return Array.from({ length: 10 }, () => crypto.randomBytes(10).toString("hex").match(/.{1,5}/g).join("-")); }
async function password(user, value) { if (!user) throw httpError(401, "Sign in again"); if (typeof value !== "string" || !await user.matchPassword(value)) throw httpError(400, "Your current password is incorrect"); }
async function proof(user, code, unit) {
  const canonical = typeof code === "string" ? code.toLowerCase().replace(/-/g, "") : "";
  const digest = hash(canonical), recovery = user.mfaRecoveryHashes || [];
  if (/^[a-f0-9]{20}$/.test(canonical) && recovery.includes(digest)) return update(user, { mfaRecoveryHashes: recovery.filter(x => x !== digest) }, unit);
  const step = matchStep(open(user.mfaSecret, user._id), code, user.mfaLastStep ?? -1);
  if (step === null) throw httpError(400, "Invalid or already-used authenticator code. Try the next code or an unused recovery code.");
  return update(user, { mfaLastStep: step }, unit);
}
async function setup(id, body) { return withOperationLock("mfa:" + id, async () => { const user = await User.findById(id).select(fields); await password(user, body.password); if (user.mfaEnabled) throw httpError(409, "Authenticator security is already enabled"); const secret = base32(crypto.randomBytes(20)); await User.updateOne({ _id: id }, { $set: { mfaPendingSecret: seal(secret, id), mfaPendingExpiresAt: new Date(Date.now() + 600000) } }); return { secret, uri: "otpauth://totp/" + encodeURIComponent("Norda:" + user.email) + "?secret=" + secret + "&issuer=Norda&algorithm=SHA1&digits=6&period=30", expiresIn: 600 }; }); }
async function change(id, action, body) { return withOperationLock("mfa:" + id, () => withDatabaseUnit(async unit => {
  let user = await querySession(User.findById(id).select(fields), unit.session); await password(user, body.password);
  let codes;
  if (action === "enable") { if (user.mfaEnabled || !user.mfaPendingSecret || +new Date(user.mfaPendingExpiresAt) <= Date.now()) throw httpError(409, "Start a fresh authenticator setup"); const step = matchStep(open(user.mfaPendingSecret, id), body.code); if (step === null) throw httpError(400, "The authenticator code is invalid"); codes = recoveryCodes(); user = await update(user, { mfaEnabled: true, mfaSecret: user.mfaPendingSecret, mfaPendingSecret: null, mfaPendingExpiresAt: null, mfaLastStep: step, mfaRecoveryHashes: codes.map(c => hash(c.replace(/-/g, ""))), mfaRevision: (user.mfaRevision || 0) + 1, tokenVersion: (user.tokenVersion || 0) + 1 }, unit); }
  else { if (!user.mfaEnabled) throw httpError(409, "Authenticator security is not enabled"); user = await proof(user, body.code, unit); if (action === "disable" && user.role === "staff" && user.staffMfaRequired) throw httpError(409, "This staff account requires authenticator security"); codes = action === "recovery" ? recoveryCodes() : undefined; user = await update(user, { ...(action === "disable" ? { mfaEnabled: false, mfaSecret: null, mfaLastStep: -1, mfaRecoveryHashes: [], mfaPendingSecret: null } : { mfaRecoveryHashes: codes.map(c => hash(c.replace(/-/g, ""))) }), mfaRevision: (user.mfaRevision || 0) + 1, tokenVersion: (user.tokenVersion || 0) + 1 }, unit); }
  return { user, recoveryCodes: codes };
})); }
async function challenge(user) { const token = crypto.randomBytes(32).toString("hex"); await Challenge.create({ hash: hash(token), user: user._id, tokenVersion: user.tokenVersion || 0, revision: user.mfaRevision || 0, attempts: 0, expiresAt: new Date(Date.now() + 300000) }); return { mfaRequired: true, challenge: token, expiresIn: 300 }; }
async function verify(body) {
  if (typeof body.challenge !== "string" || !/^[a-f0-9]{64}$/.test(body.challenge)) throw httpError(400, "Start sign-in again");
  const row = await Challenge.findOne({ hash: hash(body.challenge) }); if (!row) throw httpError(401, "Sign-in verification expired");
  return withOperationLock("mfa:" + row.user, async () => {
    const current = await Challenge.findById(row._id); if (current.usedAt || current.attempts >= 5 || +new Date(current.expiresAt) <= Date.now()) throw httpError(401, "Sign-in verification expired or exhausted; start again");
    await Challenge.updateOne({ _id: current._id }, { $inc: { attempts: 1 } });
    return withDatabaseUnit(async unit => { let user = await querySession(User.findById(row.user).select(fields), unit.session); if (!user?.mfaEnabled || (user.tokenVersion || 0) !== row.tokenVersion || (user.mfaRevision || 0) !== row.revision) throw httpError(401, "Your account changed; start sign-in again"); user = await proof(user, body.code, unit); await patch(Challenge, current, { usedAt: new Date() }, unit); return user; });
  });
}
module.exports = { key, base32, totp, matchStep, setup, change, challenge, verify, hash };

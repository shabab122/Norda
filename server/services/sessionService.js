const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const AuthSession = require("../models/AuthSession");
const { withOperationLock } = require("./operationLock");
const { objectId } = require("./orderOperationStore");
const httpError = require("../utils/httpError");
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const ipHint = (ip = "") => String(ip).replace(/^::ffff:/, "").includes(".") ? String(ip).replace(/^::ffff:/, "").split(".").slice(0, 3).join(".") + ".*" : String(ip).split(":").slice(0, 3).join(":") + ":*";
const device = (req) => String(req?.headers?.["user-agent"] || "Unknown device").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 240);
async function createSession(user, req) {
  return withOperationLock("sessions:" + user._id, async () => {
    const payload = { id: String(user._id), version: user.tokenVersion || 0 };
    const lifetime = jwt.decode(jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" })).exp;
    const session = await AuthSession.create({ user: user._id, tokenVersion: user.tokenVersion || 0, expiresAt: new Date(lifetime * 1000), lastSeenAt: new Date(), device: device(req), ipHint: ipHint(req?.ip) });
    return session;
  });
}
async function authenticateSession(decoded, token, user, req) {
  let session;
  if (decoded.sid) {
    if (!/^[a-f0-9]{24}$/i.test(decoded.sid)) return null;
    session = await AuthSession.findById(decoded.sid);
  } else {
    const legacyTokenHash = hashToken(token);
    session = await AuthSession.findOne({ legacyTokenHash }).select("+legacyTokenHash");
    if (!session) {
      try { session = await AuthSession.create({ user: user._id, tokenVersion: user.tokenVersion || 0, expiresAt: new Date((decoded.exp || Math.floor(Date.now() / 1000) + 604800) * 1000), lastSeenAt: new Date(), device: "Earlier session · " + device(req).slice(0, 210), ipHint: ipHint(req?.ip), legacyTokenHash }); }
      catch (error) { if (error.code !== 11000) throw error; session = await AuthSession.findOne({ legacyTokenHash }); }
    }
  }
  if (!session || String(session.user) !== String(user._id) || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now() || session.tokenVersion !== (user.tokenVersion || 0)) return null;
  if (Date.now() - new Date(session.lastSeenAt).getTime() > 60000) await AuthSession.updateOne({ _id: session._id, revokedAt: { $exists: false } }, { $set: { lastSeenAt: new Date() } });
  return session;
}
async function listSessions(user, current) {
  const sessions = await AuthSession.find({ user: user._id, tokenVersion: user.tokenVersion || 0, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 });
  return sessions.map((s) => ({ _id: s._id, current: String(s._id) === String(current), device: s.device, ipHint: s.ipHint, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, expiresAt: s.expiresAt }));
}
async function revokeSessions(user, current, id, others = false) {
  if (!others) objectId(id);
  return withOperationLock("sessions:" + user._id, async () => {
    const filter = { user: user._id, revokedAt: { $exists: false } };
    if (!others) filter._id = id;
    const sessions = await AuthSession.find(filter);
    if (!others && !sessions.length) throw httpError(404, "Session not found");
    if (others) return require("./databaseUnit").withDatabaseUnit(async (unit) => {
      const User = require("../models/User"), { querySession, insertDocument } = require("./databaseUnit"), { patch } = require("./orderOperationStore");
      const account = await querySession(User.findById(user._id), unit.session);
      if (!account || (account.tokenVersion || 0) !== (user.tokenVersion || 0)) throw httpError(409, "Your account changed. Sign in again.");
      const currentSession = sessions.find((s) => String(s._id) === String(current));
      if (!currentSession || currentSession.revokedAt || +new Date(currentSession.expiresAt) <= Date.now()) throw httpError(401, "The current session expired. Sign in again.");
      const updated = await patch(User, account, { tokenVersion: (account.tokenVersion || 0) + 1 }, unit);
      for (const s of sessions) await patch(AuthSession, s, { revokedAt: new Date() }, unit);
      const fresh = await insertDocument(AuthSession, { user: user._id, tokenVersion: updated.tokenVersion, expiresAt: currentSession.expiresAt, lastSeenAt: new Date(), device: currentSession.device, ipHint: currentSession.ipHint }, unit.session);
      unit.compensate(() => AuthSession.deleteOne({ _id: fresh._id }));
      return { revoked: sessions.filter((s) => String(s._id) !== String(current) && s.tokenVersion === (user.tokenVersion || 0) && +new Date(s.expiresAt) > Date.now()).length, currentRevoked: false, sessionId: fresh._id, account: updated };
    });
    let revoked = 0;
    for (const session of sessions) if (!others || String(session._id) !== String(current)) { await AuthSession.updateOne({ _id: session._id, user: user._id }, { $set: { revokedAt: new Date() } }); revoked++; }
    return { revoked, currentRevoked: !others && String(id) === String(current) };
  });
}
async function logoutToken(token, decoded) {
  const filter = decoded.sid ? { _id: decoded.sid, user: decoded.id } : { legacyTokenHash: hashToken(token), user: decoded.id };
  // A previously unseen legacy JWT must also acquire a revocation record.
  if (!decoded.sid && !await AuthSession.findOne(filter)) {
    try { await AuthSession.create({ ...filter, tokenVersion: decoded.version || 0, expiresAt: new Date((decoded.exp || Math.floor(Date.now() / 1000) + 604800) * 1000), revokedAt: new Date(), lastSeenAt: new Date(), device: "Earlier session" }); }
    catch (e) { if (e.code !== 11000) throw e; }
  }
  await AuthSession.updateOne(filter, { $set: { revokedAt: new Date() } });
}
module.exports = { authenticateSession, createSession, listSessions, revokeSessions, logoutToken, ipHint };

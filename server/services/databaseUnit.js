const mongoose = require("mongoose");
const httpError = require("../utils/httpError");

let transactionSupport;

const supportsTransactions = async () => {
  if (transactionSupport !== undefined) return transactionSupport;
  if (!mongoose.connection.db) return false;
  let hello;
  try { hello = await mongoose.connection.db.admin().command({ hello: 1 }); }
  catch (error) {
    if (error.code !== 59) throw error;
    hello = await mongoose.connection.db.admin().command({ isMaster: 1 });
  }
  transactionSupport = Boolean(hello.setName || hello.msg === "isdbgrid");
  return transactionSupport;
};

const querySession = (query, session) => (session ? query.session(session) : query);
const insertDocument = async (Model, payload, session) =>
  session ? (await Model.create([payload], { session }))[0] : Model.create(payload);
const writeOptions = (session, extra = {}) => ({ ...extra, ...(session ? { session } : {}) });

// Replica sets use real transactions. Standalone local MongoDB retains support
// through ordered compensations and database locks. A replica set is required
// for atomic recovery from a process crash or database outage during rollback.
const runAfterCommit = async (hooks) => {
  for (const hook of hooks) try { await hook(); } catch { console.error("Post-commit email activation will be recovered by the queue worker"); }
};
const withDatabaseUnit = async (work) => {
  if (await supportsTransactions()) {
    const session = await mongoose.startSession();
    let result, hooks = [];
    try {
      await session.withTransaction(async () => {
        hooks = [];
        result = await work({ session, compensate() {}, afterCommit: (hook) => hooks.push(hook) });
      });
    } finally { await session.endSession(); }
    await runAfterCommit(hooks);
    return result;
  }
  const compensations = [], hooks = [];
  let result;
  try { result = await work({ session: null, compensate: (undo) => compensations.push(undo), afterCommit: (hook) => hooks.push(hook) }); }
  catch (error) {
    const failures = [];
    for (const undo of compensations.reverse()) try { await undo(); } catch (failure) { failures.push(failure); }
    if (failures.length) {
      console.error("Commerce rollback needs attention:", error.message, failures.map((item) => item.message));
      throw httpError(503, "This operation needs store review. Please check your orders before trying again.");
    }
    throw error;
  }
  await runAfterCommit(hooks);
  return result;
};

module.exports = { insertDocument, querySession, supportsTransactions, withDatabaseUnit, writeOptions };

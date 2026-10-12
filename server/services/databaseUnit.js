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
const withDatabaseUnit = async (work) => {
  if (await supportsTransactions()) {
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = await work({ session, compensate() {} });
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  const compensations = [];
  try {
    return await work({ session: null, compensate: (undo) => compensations.push(undo) });
  } catch (error) {
    const failures = [];
    for (const undo of compensations.reverse()) {
      try { await undo(); } catch (failure) { failures.push(failure); }
    }
    if (failures.length) {
      console.error("Commerce rollback needs attention:", error.message, failures.map((item) => item.message));
      throw httpError(503, "This operation needs store review. Please check your orders before trying again.");
    }
    throw error;
  }
};

module.exports = { insertDocument, querySession, supportsTransactions, withDatabaseUnit, writeOptions };

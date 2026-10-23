const Batch = require("../models/SettlementBatch"), Entry = require("../models/SettlementEntry"), Order = require("../models/Order");
const error = require("../utils/httpError");
const { hash, minor, text, plain } = require("../utils/expansion");
const { objectId, requestKey, noteText, patch } = require("./orderOperationStore");
const { withOperationLock } = require("./operationLock");
const { withDatabaseUnit, querySession: qs, insertDocument: insert } = require("./databaseUnit");
const columns = ["kind", "provider", "reference", "orderId", "transactionId", "refundId", "gross", "fee", "net", "currency", "settledAt"];
function parse(csv) {
  if (typeof csv !== "string" || Buffer.byteLength(csv) > 500000) throw error(400, "Use a settlement CSV under 500 KB");
  const rows = require("../utils/readCsv")(csv);
  if (JSON.stringify(rows.shift()) !== JSON.stringify(columns) || !rows.length || rows.length > 500) throw error(400, "Use the exact template header and 1–500 rows");
  const seen = new Set();
  return rows.map((values, index) => {
    if (values.length !== columns.length) throw error(400, "Invalid settlement row " + (index + 2));
    const v = Object.fromEntries(columns.map((k, n) => [k, values[n].trim()]));
    if (!["gateway_sale", "cod_remittance", "gateway_refund", "exchange_sale"].includes(v.kind)) throw error(400, "Invalid settlement kind");
    v.provider = text(v.provider, 60).toLowerCase(); v.reference = text(v.reference, 120); objectId(v.orderId); if (v.refundId) objectId(v.refundId);
    v.transactionId = v.transactionId ? text(v.transactionId, 100) : "";
    if (seen.has(v.provider + ":" + v.reference)) throw error(400, "Repeated provider reference in this statement"); seen.add(v.provider + ":" + v.reference);
    const gross = minor(v.gross), fee = minor(v.fee), net = minor(v.net, true);
    if (gross <= 0 || v.currency !== "BDT" || net !== (v.kind === "gateway_refund" ? -gross - fee : gross - fee) || (v.kind !== "gateway_refund" && fee > gross)) throw error(400, "Gross, fee, signed net or BDT currency do not reconcile");
    const at = new Date(v.settledAt); if (!/^\d{4}-\d\d-\d\dT/.test(v.settledAt) || !Number.isFinite(+at) || +at > Date.now() + 86400000) throw error(400, "Use a valid ISO settlement timestamp");
    return { kind: v.kind, provider: v.provider, reference: v.reference, order: v.orderId, transactionId: v.transactionId, ...(v.refundId ? { refundId: v.refundId } : {}), gross: gross / 100, fee: fee / 100, net: net / 100, currency: v.currency, settledAt: at };
  });
}
async function classify(row, prior, session) {
  const order = await qs(Order.findById(row.order), session);
  if (!order) return { status: "unmatched", reason: "Order was not found" };
  if (order.currency !== row.currency || order.paymentMethod === "demo") return { status: "mismatch", reason: "Currency differs or this is a simulated order" };
  let allowed = 0, target = "";
  if (row.kind === "gateway_refund") {
    const refund = row.refundId ? await qs(require("../models/Refund").findById(row.refundId), session) : null;
    if (!refund || String(refund.order) !== String(order._id) || refund.status !== "succeeded" || refund.gateway === "demo" || (row.transactionId && refund.transactionId !== row.transactionId && refund.refundReference !== row.transactionId)) return { status: "unmatched", reason: "No matching confirmed real refund" };
    allowed = minor(refund.amount); target = String(refund._id);
  } else if (row.kind === "exchange_sale") {
    const payment = await qs(require("../models/ExchangePayment").findOne({ order: order._id, transactionId: row.transactionId, status: { $in: ["paid", "refunded"] } }), session);
    if (!payment || payment.gateway === "demo") return { status: "unmatched", reason: "No matching paid exchange adjustment" };
    allowed = minor(payment.amount); target = payment.transactionId;
  } else {
    if (!order.isPaid || order.paymentStatus !== "paid") return { status: "mismatch", reason: "Order payment is unpaid or under review" };
    if (row.kind === "cod_remittance") { if (order.paymentMethod !== "cod" || order.status !== "delivered") return { status: "mismatch", reason: "COD remittance requires a delivered COD order" }; }
    else {
      const payment = await qs(require("../models/Payment").findOne({ order: order._id, transactionId: row.transactionId, status: "paid", gateway: "sslcommerz" }), session);
      if (!payment || row.transactionId !== (order.paidTransactionId || order.transactionId)) return { status: "unmatched", reason: "No matching retained validated gateway transaction" };
    }
    allowed = minor(order.totalAmount);
  }
  const used = prior.filter(e => String(e.order) === String(row.order) && e.kind === row.kind && ["matched", "accepted_adjustment"].includes(e.status) && (row.kind === "gateway_refund" ? String(e.refundId) === target : row.kind === "exchange_sale" ? e.transactionId === target : true)).reduce((n, e) => n + minor(e.gross), 0);
  if (used + minor(row.gross) > allowed) return { status: "mismatch", reason: "Statement exceeds the remaining confirmed amount; check duplicates or adjustments" };
  return { status: "matched", reason: used + minor(row.gross) === allowed ? "Confirmed amount fully reconciled" : "Partial settlement recorded; a balance remains" };
}
async function preview(csv) {
  const parsed = parse(csv), prior = await Entry.find({ order: { $in: parsed.map(r => r.order) } }), entries = [];
  for (const row of parsed) {
    if (await Entry.exists({ provider: row.provider, reference: row.reference })) throw error(409, "A provider reference is already imported");
    const entry = { ...row, ...await classify(row, [...prior, ...entries]) }; entries.push(entry);
  }
  return { sourceHash: hash(csv), entries, matched: entries.filter(e => e.status === "matched").length, exceptions: entries.filter(e => e.status !== "matched").length };
}
async function apply(user, body) {
  const key = requestKey(body.requestKey), sourceName = text(body.sourceName, 120);
  if (typeof body.csv !== "string" || body.sourceHash !== hash(body.csv)) throw error(409, "Preview the unchanged CSV before importing");
  return withOperationLock("settlement-ledger", () => withDatabaseUnit(async unit => {
    const replay = await qs(Batch.findOne({ requestKey: key }), unit.session);
    if (replay) { if (replay.sourceHash !== body.sourceHash || replay.sourceName !== sourceName) throw error(409, "This import key belongs to another statement"); return replay; }
    const rows = parse(body.csv), prior = await qs(Entry.find({ order: { $in: rows.map(r => r.order) } }), unit.session), entries = [];
    for (const row of rows) {
      if (await qs(Entry.exists({ provider: row.provider, reference: row.reference }), unit.session)) throw error(409, "A provider reference was imported already");
      entries.push({ ...row, ...await classify(row, [...prior, ...entries], unit.session) });
    }
    const batch = await insert(Batch, { requestKey: key, sourceHash: body.sourceHash, sourceName, actor: user._id, rows: entries.length, matched: entries.filter(e => e.status === "matched").length, exceptions: entries.filter(e => e.status !== "matched").length }, unit.session);
    unit.compensate(() => Batch.deleteOne({ _id: batch._id }));
    for (const entry of entries) { const row = await insert(Entry, { ...entry, batch: batch._id, resolutions: [] }, unit.session); unit.compensate(() => Entry.deleteOne({ _id: row._id })); }
    return batch;
  }));
}
async function resolve(user, id, body) {
  objectId(id); const note = noteText(body.note);
  if (!["accepted_adjustment", "excluded"].includes(body.status)) throw error(400, "Choose accepted adjustment or excluded");
  return withOperationLock("settlement-ledger", () => withDatabaseUnit(async unit => {
    const entry = await qs(Entry.findById(id), unit.session); if (!entry) throw error(404, "Settlement entry not found");
    if (entry.status === "matched") throw error(409, "Matched statement lines are immutable; import a separately documented adjustment");
    if (entry.status === body.status && entry.resolutions.at(-1)?.note === note) return entry;
    return patch(Entry, entry, { status: body.status, resolutions: [...entry.resolutions.map(plain), { status: body.status, note, actor: user._id, at: new Date() }] }, unit);
  }));
}
async function report(query = {}) {
  const { page, limit } = require("../utils/validation").pagination(query), filter = {};
  if (query.status) { if (!["matched", "unmatched", "mismatch", "accepted_adjustment", "excluded"].includes(query.status)) throw error(400, "Invalid settlement status"); filter.status = query.status; }
  const entries = await Entry.find(filter).sort({ settledAt: -1 }).skip((page - 1) * limit).limit(limit), total = await Entry.countDocuments(filter);
  const all = await Entry.find({ status: { $in: ["matched", "accepted_adjustment"] } });
  const totals = all.reduce((a, e) => { a.gross += minor(e.gross) * (e.kind === "gateway_refund" ? -1 : 1); a.fees += minor(e.fee); a.net += minor(e.net, true); return a; }, { gross: 0, fees: 0, net: 0 });
  if (!Object.values(totals).every(Number.isSafeInteger)) throw error(409, "Ledger totals exceed the supported accounting range; review the statement history");
  const paid = await Order.find({ isPaid: true, paymentStatus: "paid", paymentMethod: { $in: ["cod", "sslcommerz"] } }).sort({ paidAt: 1 }).limit(500);
  const outstanding = paid.map(o => { const settled = all.filter(e => String(e.order) === String(o._id) && ["gateway_sale", "cod_remittance"].includes(e.kind)).reduce((n, e) => n + minor(e.gross), 0); return { orderId: o._id, method: o.paymentMethod, expected: o.totalAmount, settled: settled / 100, remaining: (minor(o.totalAmount) - settled) / 100 }; }).filter(o => o.remaining !== 0);
  return { entries, total, page, pages: Math.ceil(total / limit) || 1, totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / 100])), outstanding, outstandingLimitedTo: 500, batches: await Batch.find({}).sort({ createdAt: -1 }).limit(20) };
}
function template() { return columns.join(",") + "\r\n"; }
module.exports = { parse, preview, apply, resolve, report, template };

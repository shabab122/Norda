const Case = require("../models/ItemReturnCase");
const CreditNote = require("../models/CreditNote");
const Order = require("../models/Order");
const { querySession } = require("./databaseUnit");
const { patch } = require("./orderOperationStore");
async function syncCaseRefund(refund, unit) {
  if (!refund.itemCase) return;
  const item = await querySession(Case.findById(refund.itemCase), unit.session);
  if (!item || String(item.refund) !== String(refund._id)) return;
  if (refund.status === "succeeded") {
    if (!["return", "exchange"].includes(item.type) || item.status !== "received") throw new Error("Return refund settled without a recorded receipt");
    const updated = await patch(Case, item, { status: item.type === "exchange" ? "ready" : "completed", ...(item.type === "exchange" ? { exchangePaymentStatus: "refunded" } : {}) }, unit);
    const credit = await querySession(CreditNote.findOne({ itemCase: item._id }), unit.session);
    if (!credit) throw new Error("Return credit note is missing");
    await patch(CreditNote, credit, { status: "settled", settledAt: refund.completedAt || new Date(), refund: refund._id }, unit);
    const order = await querySession(Order.findById(item.order), unit.session);
    await require("./notificationService").queueOperationMessage(order, updated, "item", unit);
  }
}
module.exports = { syncCaseRefund };

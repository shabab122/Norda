const crypto = require("node:crypto");
const OrderNotification = require("../models/OrderNotification");
const Order = require("../models/Order");
const User = require("../models/User");
const mail = require("./mailService");
const { insertDocument, querySession } = require("./databaseUnit");
const { isValidEmail } = require("../utils/validation");
const httpError = require("../utils/httpError");

const customerUrl = (order, tracking = false) => {
  const base = process.env.CLIENT_APP_URL || process.env.SERVER_URL || "http://localhost:" + (process.env.PORT || 5000);
  try {
    const url = new URL(base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) return "";
    url.search = ""; url.hash = "";
    return new URL((tracking ? "order-tracking.html" : "order-support.html") + "?orderId=" + encodeURIComponent(order._id), url.href.replace(/\/?$/, "/")).href;
  } catch { return ""; }
};
const messages = {
  confirmation: ["Order confirmed", "We have received your order. Keep this reference to follow your purchase."],
  payment: ["Payment update", "Your payment status has changed. The current status is shown below."],
  shipping: ["Your order has shipped", "Your order has been handed over for delivery."],
  delivery: ["Your order was delivered", "Delivery has been recorded. Thank you for shopping with Norda."],
  cancellation: ["Order cancelled", "Your order has been cancelled. If money was captured, follow its separate refund status in your account."],
  tracking: ["Delivery update", "There is a new shipment update for your order."],
};
const queueMessage = async (order, topic, suffix, unit, extra = "") => {
  const key = String(order._id) + ":" + topic + ":" + suffix;
  unit.emailTopics ||= new Map();
  const topicKey = String(order._id) + ":" + topic;
  const staged = unit.emailTopics.get(topicKey);
  if (staged && staged.key !== key) await OrderNotification.deleteOne({ _id: staged._id }, unit.session ? { session: unit.session } : {});
  if (await querySession(OrderNotification.findOne({ key }), unit.session)) return;
  const owner = await querySession(User.findById(order.user?._id || order.user), unit.session);
  if (!owner || !isValidEmail(owner.email)) return;
  const [title, intro] = messages[topic], actionUrl = customerUrl(order, ["shipping", "delivery", "tracking"].includes(topic));
  const lines = (order.items || []).map((i) => "• " + i.name + (i.sku ? " [" + i.sku + "]" : "") + " × " + i.quantity).join("\n");
  const shipment = order.shipment || {};
  const text = ["NORDA", "Hello " + owner.name + ",", intro, "Order: " + order._id, order.invoiceNumber ? "Invoice: " + order.invoiceNumber : "", "Total: BDT " + Number(order.totalAmount).toFixed(2), order.discountAmount > 0 ? "Coupon: " + order.coupon?.code + " — saving BDT " + Number(order.discountAmount).toFixed(2) : "", "Payment: " + order.paymentStatus, "Order status: " + order.status, order.paymentMethod === "demo" ? "Test payment: no real money was transferred." : "", lines,
    shipment.courierName ? "Courier: " + shipment.courierName : "", shipment.trackingNumber ? "Tracking number: " + shipment.trackingNumber : "", extra, actionUrl ? "View your order securely: " + actionUrl : "Sign in to your Norda account to view the order.", "Norda customer care"].filter(Boolean).join("\n\n");
  const sourceState = topic === "confirmation" ? { exists: true } : topic === "payment" ? { paymentStatus: order.paymentStatus } : topic === "tracking" ? { shipmentState: shipment.state } : { status: order.status };
  const record = await insertDocument(OrderNotification, { order: order._id, user: owner._id, key, topic, to: owner.email, subject: "Norda — " + title + " #" + String(order._id).slice(-8).toUpperCase(), text, actionUrl, sourceState, status: "held", attempts: 0, nextAttemptAt: new Date() }, unit.session);
  unit.emailTopics.set(topicKey, record);
  unit.compensate(() => OrderNotification.deleteOne({ _id: record._id }));
  // Queue activation is outside the transaction; no SMTP call runs on checkout.
  unit.afterCommit?.(() => OrderNotification.updateOne({ _id: record._id, status: "held" }, { $set: { status: "queued" } }));
  return record;
};
const queueOrderChanges = async (order, previous, unit, confirmation = false) => {
  if (!unit) return;
  if (confirmation) await queueMessage(order, "confirmation", "created", unit);
  if (!previous) return;
  if (order.paymentStatus !== previous.paymentStatus && order.paymentStatus !== "pending") await queueMessage(order, "payment", (order.transactionId || "cod") + ":" + order.paymentStatus, unit);
  if (order.status !== previous.status) {
    const topic = { shipped: "shipping", delivered: "delivery", cancelled: "cancellation" }[order.status];
    if (topic) await queueMessage(order, topic, topic === "cancellation" ? new Date(order.cancelledAt || order.updatedAt).getTime() : "recorded", unit);
  }
};
const activateHeld = async (row) => {
  const order = await Order.findById(row.order), source = row.sourceState || {};
  const valid = order && (!source.status || source.status === order.status) && (!source.paymentStatus || source.paymentStatus === order.paymentStatus) && (!source.shipmentState || source.shipmentState === order.shipment?.state);
  await OrderNotification.updateOne({ _id: row._id, status: "held" }, { $set: { status: valid ? "queued" : "suppressed", ...(valid ? {} : { lastError: "Uncommitted or superseded state; message was not sent." }) } });
};
const sendNotification = async (id) => {
  const token = crypto.randomUUID(), now = new Date();
  const row = await OrderNotification.findOneAndUpdate({ _id: id, status: "queued", nextAttemptAt: { $lte: now }, attempts: { $lt: 5 } }, { $set: { status: "sending", claimedAt: now, claimToken: token }, $inc: { attempts: 1 } }, { new: true });
  if (!row) return;
  try {
    const config = mail.mailConfiguration();
    const domain = (config.from.match(/@([^<>\s]+)>?$/)?.[1] || "norda.local").toLowerCase();
    const messageId = "<norda-" + crypto.createHash("sha256").update(row.key).digest("hex").slice(0, 40) + "@" + domain + ">";
    const receipt = await mail.sendAccountMail({ to: row.to, subject: row.subject, text: row.text, kind: "order_" + row.topic, actionUrl: row.actionUrl, messageId });
    await OrderNotification.updateOne({ _id: id, status: "sending", claimToken: token }, { $set: { status: "sent", sentAt: new Date(), transport: receipt?.transport || config.transport, messageId, lastError: "" }, $unset: { claimToken: 1 } });
  } catch {
    const failed = row.attempts >= 5;
    await OrderNotification.updateOne({ _id: id, status: "sending", claimToken: token }, { $set: { status: failed ? "failed" : "queued", nextAttemptAt: new Date(Date.now() + Math.min(7200000, 60000 * 4 ** (row.attempts - 1))), lastError: "Email delivery failed. Check the existing SMTP settings or retry later." }, $unset: { claimToken: 1 } });
  }
};
const sweepNotifications = async () => {
  const stale = new Date(Date.now() - 600000);
  const interrupted = await OrderNotification.find({ status: "sending", claimedAt: { $lt: stale } }).limit(20);
  for (const row of interrupted) await OrderNotification.updateOne({ _id: row._id, status: "sending", claimedAt: { $lt: stale } }, { $set: { status: row.attempts >= 5 ? "failed" : "queued", nextAttemptAt: new Date(), lastError: "Interrupted delivery recovered; the same message identifier is retained." }, $unset: { claimToken: 1 } });
  const held = await OrderNotification.find({ status: "held", createdAt: { $lt: new Date(Date.now() - 60000) } }).limit(20);
  for (const row of held) await activateHeld(row);
  const rows = await OrderNotification.find({ status: "queued", nextAttemptAt: { $lte: new Date() }, attempts: { $lt: 5 } }).sort({ createdAt: 1 }).limit(20);
  for (const row of rows) await sendNotification(row._id);
};
const retryNotification = async (id) => {
  const result = await OrderNotification.findOneAndUpdate({ _id: id, status: "failed" }, { $set: { status: "queued", attempts: 0, nextAttemptAt: new Date(), lastError: "" } }, { new: true });
  if (!result) throw httpError(409, "Only a failed email can be retried");
  return result;
};
const startNotificationWorker = () => {
  let running, stopped = false;
  const tick = () => { if (running || stopped) return; running = sweepNotifications().catch(() => console.error("Order email queue needs attention")).finally(() => { running = null; }); };
  const timer = setInterval(tick, 15000); timer.unref(); tick();
  return async () => { stopped = true; clearInterval(timer); if (running) await running; };
};
module.exports = { customerUrl, queueMessage, queueOrderChanges, activateHeld, sendNotification, sweepNotifications, retryNotification, startNotificationWorker };

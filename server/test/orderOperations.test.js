const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { installMemoryStore } = require("../test-support/memoryStore");
const store = installMemoryStore();
const gateway = require("../services/sslcommerzService");
const originals = Object.fromEntries(["isConfigured", "validatePayment", "queryPayment", "initiateRefund", "queryRefund"].map((key) => [key, gateway[key]]));
const cases = require("../services/orderRequestService");
const refunds = require("../services/refundService");
const { reviewOrder } = require("../services/paymentReviewService");
const { createOrderFromCart, updateOrderWorkflow } = require("../services/orderService");
const { syncInvoicePayment } = require("../services/invoiceService");
const { validateAndCapture } = require("../services/paymentStateService");
const { retryPayment } = require("../services/paymentRetryService");
const { cents } = require("../services/orderOperationStore");
const U = "000000000000000000000001", A = "000000000000000000000002", P = "000000000000000000000003", P2 = "000000000000000000000004";
const address = { line1: "Operations Road", city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678" };
let remote, validations, initiated;
const record = (name, id) => store.get(name, id);
const fixture = async ({ method = "sslcommerz", paid = method !== "cod", delivered = false, two = false } = {}) => {
  store.reset(); initiated = 0; remote = new Map(); validations = new Map();
  const user = store.add("User", { _id: U, name: "Customer", email: "buyer@example.com", role: "user" });
  const admin = store.add("User", { _id: A, name: "Admin", email: "admin@example.com", role: "admin" });
  store.add("Product", { _id: P, name: "Lamp", price: 1000, stock: 10, images: [], isArchived: false });
  store.add("Product", { _id: P2, name: "Book", price: 500, stock: 5, images: [], isArchived: false });
  await store.models.Cart.create({ user: U, items: [{ product: P, quantity: 2 }, ...(two ? [{ product: P2, quantity: 1 }] : [])] });
  const f = await createOrderFromCart({ user, paymentMethod: method, paymentChannel: method === "demo" ? "mobile_banking" : "", shippingAddress: address, checkoutKey: "operations-checkout-key" });
  let payment;
  if (method !== "cod") payment = await store.models.Payment.create({ order: f.order._id, user: U, gateway: method === "demo" ? "demo" : "sslcommerz", transactionId: "PAY-ORIGINAL", amount: f.order.totalAmount, currency: "BDT", status: paid ? "paid" : "initiated", validationId: "VAL-ORIGINAL", bankTransactionId: "BANK-ORIGINAL" });
  const order = await store.models.Order.findOneAndUpdate({ _id: f.order._id }, { $set: { isPaid: paid, paymentStatus: paid ? "paid" : "pending", status: delivered ? "delivered" : paid ? "processing" : "pending", paidAt: paid ? new Date() : null, transactionId: payment?.transactionId || "", paidTransactionId: paid ? payment?.transactionId || "" : "" } });
  await syncInvoicePayment(order);
  gateway.isConfigured = () => true;
  gateway.validatePayment = async (id) => validations.get(id);
  gateway.queryPayment = async ({ transactionId }) => ({ APIConnect: "DONE", no_of_trans_found: [...validations.values()].filter((row) => row.tran_id === transactionId).length, element: [...validations.values()].filter((row) => row.tran_id === transactionId) });
  gateway.initiateRefund = async (r) => { initiated++; const ref = "REF-" + r.transactionId; remote.set(ref, { APIConnect: "DONE", bank_tran_id: r.bankTransactionId, tran_id: r.originalTransactionId, refund_ref_id: ref, refund_amount: r.amount, status: "processing" }); return { APIConnect: "DONE", bank_tran_id: r.bankTransactionId, trans_id: r.originalTransactionId, refund_ref_id: ref, status: "success" }; };
  gateway.queryRefund = async (ref) => remote.get(ref);
  if (payment) validations.set(payment.validationId, { status: "VALID", tran_id: payment.transactionId, val_id: payment.validationId, bank_tran_id: payment.bankTransactionId, amount: payment.amount, currency: "BDT", risk_level: 0 });
  return { ...f, order, payment, user, admin };
};
const request = (f, type = "cancellation", key = crypto.randomUUID()) => cases.createRequest({ orderId: f.order._id, user: f.user, body: { type, reason: "Please help with my order", requestKey: key } });
const decide = (f, item, decision = "approve") => cases.decideRequest({ requestId: item._id, user: f.admin, body: { decision, note: "Reviewed customer request" } });
const receive = (f, item, restock = true) => cases.receiveReturn({ requestId: item._id, user: f.admin, body: { received: true, restock, note: "All returned items checked" } });
const order = (f) => record("Order", f.order._id);
const refundRows = () => [...store.records.Refund.values()];
const settle = async (r) => { remote.get(r.refundReference).status = "refunded"; return refunds.processRefund(r._id); };
const review = (f, action = "approve", extra = {}) => reviewOrder({ orderId: f.order._id, user: f.admin, body: { action, note: "Evidence checked by administrator", ...extra } });
const markReview = async (f, fields = {}) => store.models.Order.updateOne({ _id: f.order._id }, { $set: { paymentStatus: "review", paymentReviewStatus: "open", paymentReviewReason: "Payment requires review", ...fields } });
const makeRefund = (f, extra = {}) => refunds.requestRefund({ orderId: f.order._id, user: f.admin, body: { requestKey: crypto.randomUUID(), note: "Refund checked by administrator", ...extra } });
test.after(() => { Object.assign(gateway, originals); store.restore(); });

test("An unpaid customer cancellation is approved once, restores stock and creates no refund", async () => {
  const f = await fixture({ method: "cod" }), key = crypto.randomUUID(); const r = await request(f, "cancellation", key);
  assert.equal((await request(f, "cancellation", key))._id, r._id);
  await decide(f, r); await decide(f, r); assert.equal(order(f).status, "cancelled"); assert.equal(record("Product", P).stock, 10);
  assert.equal(order(f).cancellationStatus, "completed"); assert.equal(refundRows().length, 0); assert.equal(record("Invoice", f.invoice._id).paymentStatus, "cancelled");
});
test("A pending cancellation blocks shipment and another online payment attempt", async () => {
  const f = await fixture({ paid: false }); await request(f);
  await assert.rejects(updateOrderWorkflow(f.order._id, { status: "shipped" }), /Resolve/);
  await assert.rejects(retryPayment({ orderId: f.order._id, user: f.user, retryKey: crypto.randomUUID() }), /Resolve/);
});
test("Rejecting a request does not change stock or payment and permits later fulfillment", async () => {
  const f = await fixture(); const r = await request(f); await decide(f, r, "reject");
  assert.equal(record("Product", P).stock, 8); assert.equal(order(f).paymentStatus, "paid"); await updateOrderWorkflow(f.order._id, { status: "shipped" });
  await assert.rejects(request(f), /before shipment/);
});
test("Customers cannot request another account's order or return an undelivered order", async () => {
  const f = await fixture(); await assert.rejects(cases.createRequest({ orderId: f.order._id, user: { _id: P2, role: "user" }, body: { type: "cancellation", reason: "Not my order", requestKey: crypto.randomUUID() } }), /Not authorized/);
  await assert.rejects(request(f, "return"), /delivered/); await request(f); await assert.rejects(request(f), /active/);
});
test("A failed request audit write restores the request, order flags and invoice", async () => {
  const f = await fixture(); store.fail("OrderEvent", "create"); await assert.rejects(request(f), /Injected/);
  assert.equal(store.records.OrderRequest.size, 0); assert.equal(order(f).cancellationStatus, undefined); assert.equal(record("Invoice", f.invoice._id).paymentStatus, "paid");
});
test("Paid cancellation queues one real refund; initiation is pending, not refunded", async () => {
  const f = await fixture(); const r = await request(f); const invoiceItems = record("Invoice", f.invoice._id).items;
  await decide(f, r); await decide(f, r); const refund = refundRows()[0]; assert.equal(refund.status, "pending"); assert.equal(initiated, 1);
  assert.equal(record("Product", P).stock, 10); assert.equal(order(f).refundStatus, "pending"); assert.equal(order(f).refundedAmount, 0);
  await settle(refund); await refunds.processRefund(refund._id); assert.equal(order(f).refundStatus, "refunded"); assert.equal(order(f).refundedAmount, f.order.totalAmount); assert.equal(order(f).cancellationStatus, "completed");
  assert.equal(record("Invoice", f.invoice._id).refundedAmount, f.order.totalAmount); assert.deepEqual(record("Invoice", f.invoice._id).items, invoiceItems); assert.equal(initiated, 1);
});
test("A failed refund-record write rolls back paid cancellation and restores its held stock", async () => {
  const f = await fixture(); const r = await request(f); store.fail("Refund", "create"); await assert.rejects(decide(f, r), /Injected/);
  assert.equal(order(f).status, "processing"); assert.equal(record("Product", P).stock, 8); assert.equal(record("OrderRequest", r._id).status, "requested"); assert.equal(initiated, 0);
});
test("A full return reserves no extra stock, restores only after receipt and refunds after confirmation", async () => {
  const f = await fixture({ delivered: true }); const r = await request(f, "return"); await decide(f, r); assert.equal(record("Product", P).stock, 8); assert.equal(refundRows().length, 0);
  await receive(f, r); await receive(f, r); assert.equal(record("Product", P).stock, 10); assert.equal(order(f).status, "delivered"); assert.equal(order(f).returnStatus, "received");
  await settle(refundRows()[0]); assert.equal(order(f).returnStatus, "completed"); assert.equal(record("OrderRequest", r._id).status, "completed"); assert.equal(order(f).refundStatus, "refunded");
});
test("Damaged returns can be received without increasing sellable stock", async () => {
  const f = await fixture({ delivered: true }); const r = await request(f, "return"); await decide(f, r); await receive(f, r, false); await receive(f, r, false);
  assert.equal(record("Product", P).stock, 8); await assert.rejects(receive(f, r, true), /different stock/);
});
test("Failure on a second returned product compensates prior restocking and keeps the return approved", async () => {
  const f = await fixture({ delivered: true, two: true }); const r = await request(f, "return"); await decide(f, r); store.fail("Product", "updateOne", 2); await assert.rejects(receive(f, r), /Injected/);
  assert.equal(record("Product", P).stock, 8); assert.equal(record("Product", P2).stock, 4); assert.equal(record("OrderRequest", r._id).status, "approved"); assert.equal(refundRows().length, 0);
});
test("Cash refunds require explicit confirmation and a receipt; a gateway refund cannot be manually confirmed", async () => {
  let f = await fixture({ method: "cod", paid: true, delivered: true }); let r = await request(f, "return"); await decide(f, r); await receive(f, r); let refund = refundRows()[0];
  assert.equal(refund.gateway, "manual"); assert.equal(refund.status, "pending");
  await assert.rejects(refunds.confirmManualRefund({ refundId: refund._id, user: f.admin, body: { note: "Cash was returned", reference: "cash-receipt" } }), /Confirm/);
  await refunds.confirmManualRefund({ refundId: refund._id, user: f.admin, body: { confirmed: true, note: "Cash was returned", reference: "cash-receipt" } });
  assert.equal(order(f).refundStatus, "refunded");
  f = await fixture(); r = await request(f); await decide(f, r); refund = refundRows()[0];
  await assert.rejects(refunds.confirmManualRefund({ refundId: refund._id, user: f.admin, body: { confirmed: true, note: "Do not bypass gateway", reference: "fake-receipt" } }), /provider/);
});
test("Simulation refunds are clearly separate and never call the refund gateway", async () => {
  const f = await fixture({ method: "demo" }); const r = await request(f); await decide(f, r);
  assert.equal(refundRows()[0].gateway, "demo"); assert.equal(refundRows()[0].status, "succeeded"); assert.equal(order(f).refundStatus, "refunded"); assert.equal(initiated, 0);
});
test("An uncertain refund submission never resubmits or permits spending its reserved balance twice", async () => {
  const f = await fixture(); gateway.initiateRefund = async () => { initiated++; throw new Error("Connection lost after send"); };
  const r = await request(f); await decide(f, r); const refund = refundRows()[0]; assert.equal(refund.status, "unknown");
  await refunds.processRefund(refund._id); await assert.rejects(makeRefund(f, { amount: 1 }), /exceeds/); assert.equal(initiated, 1); assert.equal(order(f).refundStatus, "unknown");
});
test("A pending refund only completes after matching bank, transaction and refund references", async () => {
  const f = await fixture(); const r = await request(f); await decide(f, r); const refund = refundRows()[0];
  remote.get(refund.refundReference).bank_tran_id = "ANOTHER-BANK"; remote.get(refund.refundReference).status = "refunded"; await refunds.processRefund(refund._id);
  assert.equal(record("Refund", refund._id).status, "unknown"); assert.equal(order(f).refundedAmount, 0);
});
test("A provider-cancelled refund is failed rather than falsely marked refunded", async () => {
  const f = await fixture(); const r = await request(f); await decide(f, r); const refund = refundRows()[0]; remote.get(refund.refundReference).status = "cancelled";
  await refunds.processRefund(refund._id); assert.equal(record("Refund", refund._id).status, "failed"); assert.equal(order(f).refundedAmount, 0);
});
test("Invoice failure during refund completion rolls the ledger back and a later query recovers", async () => {
  const f = await fixture(); const r = await request(f); await decide(f, r); const refund = refundRows()[0]; remote.get(refund.refundReference).status = "refunded"; store.fail("Invoice", "findOneAndUpdate");
  await assert.rejects(refunds.processRefund(refund._id), /Injected/); assert.equal(record("Refund", refund._id).status, "pending"); assert.equal(order(f).refundedAmount, 0);
  await refunds.processRefund(refund._id); assert.equal(order(f).refundedAmount, f.order.totalAmount); assert.equal(initiated, 1);
});
test("Unknown refund references can be recovered only with matching provider details and exact amount attestation", async () => {
  const f = await fixture(); gateway.initiateRefund = async () => { throw new Error("Timeout"); }; const r = await request(f); await decide(f, r); const refund = refundRows()[0];
  remote.set("RECOVERED-REF", { APIConnect: "DONE", bank_tran_id: refund.bankTransactionId, tran_id: refund.originalTransactionId, refund_ref_id: "RECOVERED-REF", status: "refunded" });
  const body = { note: "Portal receipt amount verified", refundReference: "RECOVERED-REF", confirmedAmount: refund.amount, amountVerified: true };
  await assert.rejects(refunds.reconcileRefund({ refundId: refund._id, user: f.admin, body: { ...body, amountVerified: false } }), /confirm/);
  await refunds.reconcileRefund({ refundId: refund._id, user: f.admin, body }); assert.equal(order(f).refundStatus, "refunded"); assert.equal(initiated, 0);
});
test("A reviewed valid payment is approved with an audit trail and a synchronized invoice", async () => {
  const f = await fixture(); await markReview(f); await review(f); assert.equal(order(f).paymentStatus, "paid"); assert.equal(order(f).paymentReviewStatus, "approved");
  assert.equal(order(f).settledBankTransactionId, "BANK-ORIGINAL"); assert.equal(record("Product", P).stock, 8); assert.equal(record("Invoice", f.invoice._id).paymentStatus, "paid");
  assert.ok([...store.records.OrderEvent.values()].some((row) => row.action === "payment_review_approved"));
});
test("Risk approval requires an explicit acknowledgement; mismatched validation cannot be approved", async () => {
  const f = await fixture(); await markReview(f); validations.get("VAL-ORIGINAL").risk_level = 1;
  await assert.rejects(review(f), /risk approval/); await review(f, "approve", { acknowledgeRisk: true }); assert.equal(order(f).paymentStatus, "paid");
  const g = await fixture(); await markReview(g); validations.get("VAL-ORIGINAL").amount = 1; await assert.rejects(review(g), /match/); assert.equal(order(g).paymentStatus, "review");
});
test("Approval of an auto-expired paid review re-reserves inventory but refuses unavailable stock", async () => {
  const f = await fixture(); await markReview(f, { status: "cancelled", stockRestored: true, reservationExpiredAt: new Date() }); await store.models.Product.updateOne({ _id: P }, { $set: { stock: 10 } });
  await review(f); assert.equal(record("Product", P).stock, 8); assert.equal(order(f).status, "processing");
  const g = await fixture(); await markReview(g, { status: "cancelled", stockRestored: true, reservationExpiredAt: new Date() }); await store.models.Product.updateOne({ _id: P }, { $set: { stock: 0 } });
  await assert.rejects(review(g), /Not enough stock/); assert.equal(order(g).paymentStatus, "review"); assert.equal(record("Product", P).stock, 0);
});
test("A manually cancelled paid review cannot be reopened through approval", async () => {
  const f = await fixture(); await markReview(f, { status: "cancelled", stockRestored: true, reservationExpiredAt: null }); await assert.rejects(review(f), /manually cancelled/);
});
test("An additional charge is refunded separately before the retained payment is approved", async () => {
  const f = await fixture(); await markReview(f); const extra = await store.models.Payment.create({ order: f.order._id, user: U, gateway: "sslcommerz", transactionId: "PAY-EXTRA", amount: f.order.totalAmount, currency: "BDT", status: "paid", validationId: "VAL-EXTRA", bankTransactionId: "BANK-EXTRA" });
  validations.set("VAL-EXTRA", { status: "VALID", tran_id: extra.transactionId, val_id: "VAL-EXTRA", bank_tran_id: "BANK-EXTRA", amount: extra.amount, currency: "BDT", risk_level: 0 });
  await assert.rejects(review(f), /additional/); const refund = await makeRefund(f, { paymentId: extra._id }); assert.equal(refund.scope, "extra_payment"); assert.equal(order(f).status, "processing");
  await settle(refund); assert.equal(order(f).refundedAmount, 0); assert.equal(order(f).extraRefundedAmount, extra.amount); await review(f); assert.equal(order(f).paymentStatus, "paid"); assert.equal(record("Product", P).stock, 8);
});
test("Distinct bank charges within one gateway attempt have separate refund balances", async () => {
  const f = await fixture(); await markReview(f); await store.models.Payment.updateOne({ _id: f.payment._id }, { $set: { duplicateValidationIds: ["VAL-DUPLICATE"] } });
  validations.set("VAL-DUPLICATE", { status: "VALID", tran_id: f.payment.transactionId, val_id: "VAL-DUPLICATE", bank_tran_id: "BANK-DUPLICATE", amount: f.payment.amount, currency: "BDT", risk_level: 0 });
  const refund = await makeRefund(f, { paymentId: f.payment._id, validationId: "VAL-DUPLICATE" }); assert.equal(refund.scope, "extra_payment"); await settle(refund); await review(f); assert.equal(order(f).refundStatus, "none"); assert.equal(order(f).paymentStatus, "paid");
});
test("A cancelled review closes only after every validated charge has been refunded", async () => {
  const f = await fixture(); await markReview(f); const refund = await makeRefund(f); assert.equal(order(f).status, "cancelled"); await assert.rejects(review(f, "close_refunded"), /fully refunded/);
  await settle(refund); await review(f, "close_refunded"); assert.equal(order(f).paymentReviewStatus, "refunded"); assert.equal(order(f).paymentStatus, "paid"); assert.equal(record("Product", P).stock, 10);
});
test("Refund request replay and parallel attempts cannot create duplicate payouts", async () => {
  const f = await fixture(); await markReview(f); const key = crypto.randomUUID(); const first = await makeRefund(f, { requestKey: key }); const replay = await makeRefund(f, { requestKey: key });
  assert.equal(first._id, replay._id); assert.equal(initiated, 1); assert.equal(refundRows().length, 1);
  const g = await fixture(); await markReview(g); const results = await Promise.allSettled([makeRefund(g), makeRefund(g)]); assert.equal(results.filter((row) => row.status === "fulfilled").length, 1); assert.equal(refundRows().length, 1);
});
test("A partial refund remains visible without rewriting the original invoice total", async () => {
  const f = await fixture(); await markReview(f); const first = await makeRefund(f, { amount: 100 }); await settle(first);
  assert.equal(order(f).refundStatus, "partially_refunded"); assert.equal(record("Invoice", f.invoice._id).totalAmount, f.order.totalAmount); assert.equal(record("Invoice", f.invoice._id).refundedAmount, 100);
  const second = await makeRefund(f); await settle(second); assert.equal(order(f).refundStatus, "refunded");
});
test("Refund amounts reject non-finite, fractional precision, zero and negative values", () => {
  for (const value of [NaN, Infinity, 0, -1, "1.001", {}, "1e3", ""]) assert.throws(() => cents(value), /amount|positive/);
  assert.equal(cents("12.50"), 1250);
});
test("A refunded payment callback replay cannot undo its refund ledger or restored inventory", async () => {
  const f = await fixture(); const r = await request(f); await decide(f, r); await settle(refundRows()[0]); await validateAndCapture("PAY-ORIGINAL", "VAL-ORIGINAL");
  assert.equal(order(f).refundStatus, "refunded"); assert.equal(order(f).status, "cancelled"); assert.equal(record("Product", P).stock, 10);
});
test("Admin can designate a different retained charge before refunding the original extra charge", async () => {
  const f = await fixture(); await markReview(f);
  const extra = await store.models.Payment.create({ order: f.order._id, user: U, gateway: "sslcommerz", transactionId: "PAY-ALTERNATE", amount: f.order.totalAmount, currency: "BDT", status: "paid", validationId: "VAL-ALTERNATE", bankTransactionId: "BANK-ALTERNATE" });
  validations.set("VAL-ALTERNATE", { status: "VALID", tran_id: extra.transactionId, val_id: "VAL-ALTERNATE", bank_tran_id: "BANK-ALTERNATE", amount: extra.amount, currency: "BDT", risk_level: 0 });
  await review(f, "retain", { paymentId: extra._id, validationId: "VAL-ALTERNATE" });
  const refund = await makeRefund(f, { paymentId: f.payment._id }); assert.equal(refund.scope, "extra_payment"); assert.equal(order(f).status, "processing");
  await settle(refund); await review(f, "approve", { paymentId: extra._id, validationId: "VAL-ALTERNATE" });
  assert.equal(order(f).paidTransactionId, extra.transactionId); assert.equal(order(f).refundedAmount, 0); assert.equal(record("Product", P).stock, 8);
});
const queuedFixture = async () => {
  const f = await fixture(); const { withDatabaseUnit } = require("../services/databaseUnit");
  const { cancelForOperations } = require("../services/orderOperationStore");
  const source = await require("../services/verifiedPayments").refundSource(f.order);
  const refund = await withDatabaseUnit(async (unit) => {
    const cancelled = await cancelForOperations(await store.models.Order.findById(f.order._id), "Approved refund queue", unit);
    return refunds.queueRefundInUnit({ order: cancelled, source, amount: Math.round(source.amount * 100), key: crypto.randomUUID(), reason: "Approved refund queue", actor: f.admin }, unit);
  });
  return { f, refund };
};
test("Refund worker starts queued work once and reconciles its later provider confirmation", async () => {
  const { f, refund } = await queuedFixture(); const stop = refunds.startRefundWorker(); await stop();
  assert.equal(record("Refund", refund._id).status, "pending"); assert.equal(initiated, 1);
  remote.get(record("Refund", refund._id).refundReference).status = "refunded"; await refunds.sweepRefunds(); assert.equal(order(f).refundStatus, "refunded"); assert.equal(initiated, 1);
});
test("Interrupted submission becomes unknown without automatically sending another refund", async () => {
  const { refund } = await queuedFixture(); await store.models.Refund.updateOne({ _id: refund._id }, { $set: { status: "submitting", submittedAt: new Date(Date.now() - 120000) } });
  await refunds.processRefund(refund._id); assert.equal(record("Refund", refund._id).status, "unknown"); assert.equal(initiated, 0);
});
test("Missing gateway configuration leaves an unsent queue recoverable", async () => {
  const { refund } = await queuedFixture(); gateway.isConfigured = () => false; await refunds.processRefund(refund._id); assert.equal(record("Refund", refund._id).status, "queued"); assert.equal(initiated, 0);
});
test("An approval audit failure restores released stock, review state and invoice", async () => {
  const f = await fixture(); await markReview(f, { status: "cancelled", stockRestored: true, reservationExpiredAt: new Date() }); await store.models.Product.updateOne({ _id: P }, { $set: { stock: 10 } });
  store.fail("OrderEvent", "create"); await assert.rejects(review(f), /Injected/); assert.equal(order(f).paymentStatus, "review"); assert.equal(order(f).stockRestored, true); assert.equal(record("Product", P).stock, 10); assert.equal(record("Invoice", f.invoice._id).paymentStatus, "review");
});
test("A late payment after approved unpaid cancellation becomes review and can be refunded without reopening stock", async () => {
  const f = await fixture({ paid: false }); const r = await request(f); await decide(f, r); assert.equal(refundRows().length, 0);
  await validateAndCapture("PAY-ORIGINAL", "VAL-ORIGINAL"); assert.equal(order(f).paymentStatus, "review"); assert.equal(record("Product", P).stock, 10);
  const refund = await makeRefund(f); await settle(refund); await review(f, "close_refunded"); assert.equal(order(f).status, "cancelled"); assert.equal(order(f).paymentReviewStatus, "refunded"); assert.equal(record("Product", P).stock, 10);
});
test("An actual high-risk unpaid review needs acknowledgement before becoming paid", async () => {
  const f = await fixture({ paid: false }); validations.get("VAL-ORIGINAL").risk_level = 1; await validateAndCapture("PAY-ORIGINAL", "VAL-ORIGINAL"); assert.equal(order(f).isPaid, false);
  await assert.rejects(review(f), /risk approval/); await review(f, "approve", { acknowledgeRisk: true }); assert.equal(order(f).isPaid, true); assert.equal(order(f).status, "processing");
});

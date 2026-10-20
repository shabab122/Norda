const test = require("node:test");
const assert = require("node:assert/strict");
const { installMemoryStore } = require("../test-support/memoryStore");
const store = installMemoryStore();
const gateway = require("../services/sslcommerzService");
const originals = { isConfigured: gateway.isConfigured, queryPayment: gateway.queryPayment, createPaymentSession: gateway.createPaymentSession, validatePayment: gateway.validatePayment };
const { createOrderFromCart, cancelOrderAndRestoreStock, updateOrderWorkflow } = require("../services/orderService");
const { expireReservations, expireReservationForOrder, startReservationWorker } = require("../services/reservationService");
const { retryPayment } = require("../services/paymentRetryService");
const { validateAndCapture, markPaymentUnsuccessful } = require("../services/paymentStateService");
const { orderView } = require("../services/orderView");
const { initiateDemo, completeDemo } = require("../services/demoPaymentService");
const USER = "000000000000000000000001", PRODUCT = "000000000000000000000002", SECOND = "000000000000000000000003";
const address = { line1: "Recovery Street", city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678" };
let sessions;
const fixture = async ({ method = "sslcommerz", two = false } = {}) => {
  store.reset(); sessions = 0;
  gateway.isConfigured = () => true;
  gateway.queryPayment = async ({ transactionId, sessionKey }) => {
    const p = [...store.records.Payment.values()].find((row) => transactionId ? row.transactionId === transactionId : row.sessionKey === sessionKey);
    const row = { tran_id: p.transactionId, status: p.status === "initiated" ? "PENDING" : "FAILED" };
    return sessionKey ? { APIConnect: "DONE", ...row } : { APIConnect: "DONE", no_of_trans_found: 1, element: [row] };
  };
  gateway.createPaymentSession = async () => { sessions++; return { checkoutUrl: "https://sandbox.sslcommerz.com/recovery-" + sessions, sessionKey: "session-" + sessions }; };
  gateway.validatePayment = async (id) => {
    const p = [...store.records.Payment.values()].find((row) => id.startsWith(row.transactionId + ":"));
    return { status: "VALID", tran_id: p.transactionId, val_id: id, bank_tran_id: id + ":bank", amount: p.amount, currency: "BDT", risk_level: 0 };
  };
  const user = store.add("User", { _id: USER, name: "Recovery customer", email: "recovery@example.com", address: { line1: "Original" } });
  store.add("Product", { _id: PRODUCT, name: "Headphones", price: 1500, discountPrice: 1000, stock: 10, isArchived: false, images: [] });
  store.add("Product", { _id: SECOND, name: "Lamp", price: 800, stock: 5, isArchived: false, images: [] });
  await store.models.Cart.create({ user: USER, items: [{ product: PRODUCT, quantity: 2 }, ...(two ? [{ product: SECOND, quantity: 1 }] : [])] });
  const result = await createOrderFromCart({ user, shippingAddress: address, paymentMethod: method, paymentChannel: method === "demo" ? "mobile_banking" : "", checkoutKey: "recovery-checkout-key" });
  if (method === "sslcommerz") {
    await store.models.Payment.create({ user: USER, order: result.order._id, gateway: "sslcommerz", transactionId: "OLD-TRANSACTION", amount: result.order.totalAmount, currency: "BDT", status: "failed" });
    await store.models.Order.updateOne({ _id: result.order._id }, { $set: { transactionId: "OLD-TRANSACTION", paymentStatus: "failed" } });
  }
  return { ...result, user };
};
const due = (order) => store.models.Order.updateOne({ _id: order._id }, { $set: { reservationExpiresAt: new Date(Date.now() - 1000) } });
const retry = (f, key = "unique-retry-key-0001") => retryPayment({ user: f.user, orderId: f.order._id, retryKey: key });
const read = (f) => store.get("Order", f.order._id);
test.after(() => { Object.assign(gateway, originals); store.restore(); });

test("Online checkout creates a reservation; COD is excluded from expiry", async () => {
  const f = await fixture(); assert.ok(new Date(f.order.reservationExpiresAt) > new Date());
  const cod = await fixture({ method: "cod" }); await due(cod.order);
  assert.equal((await expireReservations()).expired, 0); assert.equal(read(cod).status, "pending"); assert.equal(store.get("Product", PRODUCT).stock, 8);
});
test("Expiry restores stock once and preserves the original order and invoice snapshots", async () => {
  const f = await fixture(); const snapshot = store.get("Invoice", f.invoice._id); await due(f.order);
  assert.equal((await expireReservations()).expired, 1); await expireReservations(); await expireReservationForOrder(f.order._id);
  assert.equal(store.get("Product", PRODUCT).stock, 10); assert.equal(read(f).status, "cancelled"); assert.ok(read(f).reservationExpiredAt);
  assert.equal(store.get("Invoice", f.invoice._id).paymentStatus, "cancelled"); assert.deepEqual(store.get("Invoice", f.invoice._id).items, snapshot.items);
  assert.equal(store.records.Order.size, 1); assert.equal(store.records.Invoice.size, 1);
});
test("Legacy unpaid online orders without a deadline expire from createdAt", async () => {
  const f = await fixture(); await store.models.Order.updateOne({ _id: f.order._id }, { $unset: { reservationExpiresAt: 1 }, $set: { createdAt: new Date(Date.now() - 31 * 60000) } });
  assert.equal((await expireReservations()).expired, 1); assert.equal(store.get("Product", PRODUCT).stock, 10);
});
for (const fields of [{ isPaid: true, paymentStatus: "paid" }, { paymentStatus: "review" }, { status: "shipped" }, { status: "delivered" }]) {
  test("Expiry ignores protected state " + JSON.stringify(fields), async () => {
    const f = await fixture(); await due(f.order); await store.models.Order.updateOne({ _id: f.order._id }, { $set: fields });
    assert.equal((await expireReservations()).expired, 0); assert.equal(store.get("Product", PRODUCT).stock, 8);
  });
}
test("Failed invoice writes roll back expiry and a later sweep succeeds", async () => {
  const f = await fixture(); await due(f.order); store.fail("Invoice", "findOneAndUpdate"); await assert.rejects(expireReservationForOrder(f.order._id), /Injected/);
  assert.equal(store.get("Product", PRODUCT).stock, 8); assert.equal(read(f).status, "pending"); await expireReservationForOrder(f.order._id); assert.equal(store.get("Product", PRODUCT).stock, 10);
});
test("The startup worker sweeps overdue reservations and stops cleanly", async () => {
  const f = await fixture(); await due(f.order); const stop = startReservationWorker(); await stop(); assert.ok(read(f).reservationExpiredAt); assert.equal(store.get("Product", PRODUCT).stock, 10);
});
test("Overlapping expiry workers cannot release inventory twice", async () => {
  const f = await fixture(); await due(f.order); await Promise.allSettled([expireReservationForOrder(f.order._id), expireReservationForOrder(f.order._id)]);
  assert.equal(store.get("Product", PRODUCT).stock, 10); assert.equal(store.records.OperationLock.size, 0);
});
test("Retry reuses one order and invoice, preserves snapshot prices and a newer cart, and replays one session", async () => {
  const f = await fixture(); const invoice = store.get("Invoice", f.invoice._id);
  await store.models.Cart.updateOne({ user: USER }, { $set: { items: [{ product: SECOND, quantity: 1 }] } });
  await store.models.Product.updateOne({ _id: PRODUCT }, { $set: { price: 9000, discountPrice: 0 } }); const cart = [...store.records.Cart.values()][0];
  const result = await retry(f); assert.equal(String(result.orderId), String(f.order._id)); assert.equal(result.invoiceNumber, invoice.invoiceNumber); assert.equal(sessions, 1);
  assert.equal(store.records.Order.size, 1); assert.equal(store.records.Invoice.size, 1); assert.equal(read(f).totalAmount, 2120); assert.deepEqual([...store.records.Cart.values()][0], cart); assert.equal(store.get("Product", PRODUCT).stock, 8);
  assert.equal((await retry(f)).checkoutUrl, result.checkoutUrl); assert.equal(sessions, 1); assert.equal(store.records.Payment.size, 2);
});
test("Expired orders re-reserve their items before opening hosted payment", async () => {
  const f = await fixture(); await due(f.order); await expireReservations(); assert.ok((await retry(f)).checkoutUrl);
  assert.equal(store.get("Product", PRODUCT).stock, 8); assert.equal(read(f).stockRestored, false); assert.equal(read(f).reservationExpiredAt, null); assert.equal(read(f).status, "pending"); assert.equal(store.get("Invoice", f.invoice._id).paymentStatus, "pending");
});
test("An unavailable second product compensates the first re-reservation", async () => {
  const f = await fixture({ two: true }); await due(f.order); await expireReservations(); await store.models.Product.updateOne({ _id: SECOND }, { $set: { stock: 0 } });
  await assert.rejects(retry(f), /Not enough stock/); assert.equal(store.get("Product", PRODUCT).stock, 10); assert.equal(read(f).status, "cancelled"); assert.equal(store.records.Payment.size, 1); assert.equal(sessions, 0);
});
test("Archived products block recovery without consuming stock", async () => {
  const f = await fixture(); await due(f.order); await expireReservations(); await store.models.Product.updateOne({ _id: PRODUCT }, { $set: { isArchived: true } });
  await assert.rejects(retry(f), /Not enough stock/); assert.equal(store.get("Product", PRODUCT).stock, 10);
});
test("Retry persistence failure restores the expired order, invoice and inventory", async () => {
  const f = await fixture(); await due(f.order); await expireReservations(); store.fail("Payment", "create"); await assert.rejects(retry(f), /Injected/);
  assert.equal(store.get("Product", PRODUCT).stock, 10); assert.equal(read(f).stockRestored, true); assert.equal(read(f).status, "cancelled"); assert.equal(store.get("Invoice", f.invoice._id).paymentStatus, "cancelled");
});
test("Manual cancellation, another customer, COD and review orders reject retry", async () => {
  let f = await fixture(); await cancelOrderAndRestoreStock(f.order, "Manual cancellation"); await assert.rejects(retry(f), /cannot be reopened/);
  f = await fixture(); await assert.rejects(retryPayment({ user: { _id: SECOND }, orderId: f.order._id, retryKey: "another-retry-key" }), /Not authorized/);
  f = await fixture({ method: "cod" }); await assert.rejects(retry(f), /does not use/);
  f = await fixture(); await store.models.Order.updateOne({ _id: f.order._id }, { $set: { paymentStatus: "review" } }); await assert.rejects(retry(f), /store review/);
});
test("A pending remote attempt resumes instead of opening a second session", async () => {
  const f = await fixture(); await store.models.Payment.updateOne({ transactionId: "OLD-TRANSACTION" }, { $set: { status: "initiated", checkoutUrl: "https://sandbox.sslcommerz.com/original", sessionKey: "original" } });
  assert.equal((await retry(f)).resumed, true); assert.equal(sessions, 0); assert.equal(store.records.Payment.size, 1);
});
test("Missing transaction rows fall back to the saved session query", async () => {
  const f = await fixture(); await store.models.Payment.updateOne({ transactionId: "OLD-TRANSACTION" }, { $set: { checkoutUrl: "https://sandbox.sslcommerz.com/original", sessionKey: "original" } });
  let lookups = 0; gateway.queryPayment = async ({ sessionKey }) => { lookups++; return sessionKey ? { APIConnect: "DONE", tran_id: "OLD-TRANSACTION", status: "PENDING" } : { APIConnect: "DONE", no_of_trans_found: 0, element: [] }; };
  assert.equal((await retry(f)).resumed, true); assert.equal(lookups, 2); assert.equal(sessions, 0);
});
test("Confirmed empty history can recover initialization that never returned a hosted URL", async () => {
  const f = await fixture(); gateway.queryPayment = async () => ({ APIConnect: "DONE", no_of_trans_found: 0, element: [] }); assert.ok((await retry(f)).checkoutUrl); assert.equal(sessions, 1);
});
for (const response of [{ APIConnect: "FAILED" }, { APIConnect: "DONE", no_of_trans_found: 1, element: [] }, { APIConnect: "DONE", no_of_trans_found: 1, element: [{ tran_id: "WRONG", status: "FAILED" }] }]) {
  test("Unclear gateway history blocks a new charge: " + JSON.stringify(response), async () => {
    const f = await fixture(); gateway.queryPayment = async () => response; await assert.rejects(retry(f), /checked|history|unclear/); assert.equal(sessions, 0);
  });
}
test("Gateway outages still commit an overdue inventory release", async () => {
  const f = await fixture(); await due(f.order); gateway.queryPayment = async () => { throw new Error("Gateway unavailable"); }; await assert.rejects(retry(f), /unavailable/); assert.equal(store.get("Product", PRODUCT).stock, 10); assert.ok(read(f).reservationExpiredAt);
});
test("Retry reconciles a missed success callback instead of charging again", async () => {
  const f = await fixture(); gateway.queryPayment = async () => ({ APIConnect: "DONE", no_of_trans_found: 1, element: [{ tran_id: "OLD-TRANSACTION", status: "VALIDATED", val_id: "OLD-TRANSACTION:one" }] });
  assert.equal((await retry(f)).alreadyPaid, true); assert.equal(sessions, 0); assert.equal(read(f).paymentStatus, "paid");
});
test("Multiple successful gateway rows require review and prevent a new charge", async () => {
  const f = await fixture(); gateway.queryPayment = async () => ({ APIConnect: "DONE", no_of_trans_found: 2, element: ["one", "two"].map((id) => ({ tran_id: "OLD-TRANSACTION", status: "VALIDATED", val_id: "OLD-TRANSACTION:" + id })) });
  assert.equal((await retry(f)).review, true); assert.equal(read(f).isPaid, true); assert.equal(read(f).paymentStatus, "review"); assert.equal(sessions, 0);
});
test("A valid callback after deadline releases stock and becomes review before any sweep", async () => {
  const f = await fixture(); await due(f.order); assert.equal((await validateAndCapture("OLD-TRANSACTION", "OLD-TRANSACTION:late")).review, true);
  assert.equal(read(f).isPaid, true); assert.equal(read(f).status, "cancelled"); assert.equal(store.get("Product", PRODUCT).stock, 10); await assert.rejects(updateOrderWorkflow(f.order._id, { status: "processing" }), /cannot move|validated/);
});
test("An old failure callback cannot overwrite a newer retry or its invoice", async () => {
  const f = await fixture(); await retry(f); await markPaymentUnsuccessful("OLD-TRANSACTION", "cancelled", "Late old callback"); assert.equal(read(f).paymentStatus, "pending"); assert.equal(store.get("Invoice", f.invoice._id).paymentStatus, "pending");
});
test("Success on two attempts preserves the first paid time and requires review without touching stock", async () => {
  const f = await fixture(); await retry(f); const newer = read(f).transactionId;
  await validateAndCapture(newer, newer + ":one"); const paidAt = read(f).paidAt; await validateAndCapture("OLD-TRANSACTION", "OLD-TRANSACTION:late");
  assert.equal(read(f).isPaid, true); assert.equal(read(f).paymentStatus, "review"); assert.equal(read(f).paidAt, paidAt); assert.equal(store.get("Product", PRODUCT).stock, 8);
  await validateAndCapture(newer, newer + ":one"); await markPaymentUnsuccessful(newer, "failed", "Out of order"); assert.equal(read(f).paymentStatus, "review"); assert.equal(store.get("Invoice", f.invoice._id).paymentStatus, "review");
});
test("Repeated validation is idempotent; a distinct bank charge on the same attempt requires review", async () => {
  const f = await fixture(); await validateAndCapture("OLD-TRANSACTION", "OLD-TRANSACTION:one"); const paidAt = read(f).paidAt;
  await validateAndCapture("OLD-TRANSACTION", "OLD-TRANSACTION:one"); assert.equal(read(f).paymentStatus, "paid"); await validateAndCapture("OLD-TRANSACTION", "OLD-TRANSACTION:two"); assert.equal(read(f).paymentStatus, "review"); assert.equal(read(f).paidAt, paidAt);
});
test("Overlapping retries create one session and release their locks", async () => {
  const f = await fixture(); const results = await Promise.allSettled([retry(f), retry(f)]); assert.equal(results.filter((item) => item.status === "fulfilled").length, 1); assert.equal(sessions, 1); assert.equal(store.records.Payment.size, 2);
});
test("Retry initialization failures keep one saved unpaid order and matching invoice", async () => {
  const f = await fixture(); gateway.createPaymentSession = async () => { throw new Error("Initialization failure"); }; await assert.rejects(retry(f), /Initialization/);
  assert.equal(read(f).paymentStatus, "failed"); assert.equal(store.get("Invoice", f.invoice._id).paymentStatus, "failed"); assert.equal(store.get("Product", PRODUCT).stock, 8); assert.equal(store.records.Order.size, 1);
});
test("Unavailable configuration and malformed retry keys cause no order mutation", async () => {
  const f = await fixture(); gateway.isConfigured = () => false; await assert.rejects(retry(f), /unavailable/); gateway.isConfigured = () => true; await assert.rejects(retry(f, "short"), /Invalid checkout/); assert.equal(store.records.Payment.size, 1);
});
test("Order reads expose recovery eligibility without mutating inventory or state", async () => {
  const f = await fixture(); await due(f.order); const before = read(f); const view = orderView(await store.models.Order.findById(f.order._id)); assert.equal(view.paymentRecovery.canRetry, true); assert.deepEqual(read(f), before); assert.equal(store.get("Product", PRODUCT).stock, 8);
});
test("An abandoned simulation expires and rejects completion after the deadline", async () => {
  const f = await fixture({ method: "demo" }); const session = await initiateDemo({ user: f.user, shippingAddress: address, checkoutKey: "recovery-checkout-key", channel: "mobile_banking" });
  await due(f.order); await assert.rejects(completeDemo(f.user, String(session.orderId), "success"), /reservation expired/); assert.ok(read(f).reservationExpiredAt); assert.equal(store.get("Product", PRODUCT).stock, 10); assert.equal(read(f).isPaid, false);
});
test("Interrupted simulation initiation after its deadline commits expiry without creating an attempt", async () => {
  const f = await fixture({ method: "demo" }); await due(f.order);
  const result = await initiateDemo({ user: f.user, shippingAddress: address, checkoutKey: "recovery-checkout-key", channel: "mobile_banking" });
  assert.ok(result.reservationExpiredAt); assert.equal(result.orderStatus, "cancelled"); assert.equal(store.get("Product", PRODUCT).stock, 10); assert.equal(store.records.Payment.size, 0);
});
test("A pending gateway transaction without a recoverable hosted URL blocks another charge", async () => {
  const f = await fixture(); await store.models.Payment.updateOne({ transactionId: "OLD-TRANSACTION" }, { $set: { status: "initiated" } });
  await assert.rejects(retry(f), /unresolved/); assert.equal(sessions, 0); assert.equal(store.records.Payment.size, 1);
});
test("A recovered reservation can expire again and releases exactly its newly held quantity", async () => {
  const f = await fixture(); await due(f.order); await expireReservations(); await retry(f);
  assert.equal(store.get("Product", PRODUCT).stock, 8); await due(f.order); await expireReservations(); await expireReservations();
  assert.equal(store.get("Product", PRODUCT).stock, 10); assert.equal(read(f).status, "cancelled"); assert.equal(store.records.Invoice.size, 1);
});
test("Capture failure after deadline compensates payment, invoice, expiry and inventory together", async () => {
  const f = await fixture(); await due(f.order); store.fail("Invoice", "findOneAndUpdate", 2);
  await assert.rejects(validateAndCapture("OLD-TRANSACTION", "OLD-TRANSACTION:late"), /Injected/);
  assert.equal(store.get("Product", PRODUCT).stock, 8); assert.equal(read(f).status, "pending"); assert.equal(read(f).isPaid, false);
  await validateAndCapture("OLD-TRANSACTION", "OLD-TRANSACTION:late"); assert.equal(read(f).paymentStatus, "review"); assert.equal(store.get("Product", PRODUCT).stock, 10);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { installMemoryStore } = require("../test-support/memoryStore");
const store = installMemoryStore();
const { createOrderFromCart, cancelOrderAndRestoreStock, updateOrderWorkflow } = require("../services/orderService");
const { validateAndCapture, markPaymentUnsuccessful } = require("../controllers/paymentController");
const { getCart, addToCart, updateCartItem, removeCartItem } = require("../controllers/cartController");
const gateway = require("../services/sslcommerzService");
const originalValidation = gateway.validatePayment;
const USER = "000000000000000000000001";
const PRODUCT = "000000000000000000000002";
const SECOND = "000000000000000000000003";
const CART = "000000000000000000000004";
const address = { line1: 'House "Rose", Road 4', city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "+8801712345678" };
const fixture = (two = false) => {
  store.reset();
  const user = store.add("User", { _id: USER, name: "Customer", role: "user", address: { line1: "Previous address" }, tokenVersion: 0 });
  store.add("Product", { _id: PRODUCT, name: "Headphones", price: 1500, discountPrice: 1000, stock: 10, images: [], isArchived: false });
  store.add("Product", { _id: SECOND, name: "Book", price: 3000, stock: 5, images: [], isArchived: false });
  const items = [{ _id: "000000000000000000000010", product: PRODUCT, quantity: 2, price: 1 }];
  if (two) items.push({ _id: "000000000000000000000011", product: SECOND, quantity: 1, price: 1 });
  store.add("Cart", { _id: CART, user: USER, items });
  return { user, shippingAddress: address, paymentMethod: "cod", checkoutKey: "regression-checkout-key" };
};
const jsonController = async (handler, req) => {
  let data; let status = 200;
  await handler(req, { status(value) { status = value; return this; }, json(value) { data = value; return this; } }, (error) => { throw error; });
  return { data, status };
};
const onlineFixture = async () => {
  const input = fixture(); input.paymentMethod = "sslcommerz";
  const result = await createOrderFromCart(input);
  await store.models.Order.updateOne({ _id: result.order._id }, { $set: { transactionId: "VALID-TRANSACTION" } });
  await store.models.Payment.create({ order: result.order._id, user: USER, transactionId: "VALID-TRANSACTION", amount: result.order.totalAmount, currency: "BDT" });
  gateway.validatePayment = async () => ({ status: "VALID", tran_id: "VALID-TRANSACTION", amount: result.order.totalAmount, currency: "BDT", risk_level: 0, val_id: "VALIDATION" });
  return result;
};
test.after(() => { gateway.validatePayment = originalValidation; store.restore(); });

test("COD checkout uses current prices, keeps invoice snapshots and clears the cart last", async () => {
  const result = await createOrderFromCart(fixture());
  assert.equal(result.order.subtotal, 2000); assert.equal(result.order.totalAmount, 2120);
  assert.equal(result.invoice.items[0].unitPrice, 1000);
  assert.equal(store.get("Product", PRODUCT).stock, 8);
  assert.deepEqual(store.get("Cart", CART).items, []);
  assert.equal(store.get("User", USER).address.line1, address.line1);
});
for (const [name, method, occurrence] of [["Product", "findOneAndUpdate", 2], ["Invoice", "create", 1], ["User", "findByIdAndUpdate", 1], ["Cart", "updateOne", 1]]) {
  // findByIdAndUpdate delegates to findOneAndUpdate in the adapter.
  const failureMethod = method === "findByIdAndUpdate" ? "findOneAndUpdate" : method;
  test(`Checkout restores stock, records, address and cart after ${name}.${method} fails`, async () => {
    const input = fixture(true);
    const before = store.get("Cart", CART); const userBefore = store.get("User", USER);
    store.fail(name, failureMethod, occurrence);
    await assert.rejects(createOrderFromCart(input), /Injected/);
    assert.equal(store.get("Product", PRODUCT).stock, 10); assert.equal(store.get("Product", SECOND).stock, 5);
    assert.equal(store.records.Order.size, 0); assert.equal(store.records.Invoice.size, 0);
    assert.deepEqual(store.get("Cart", CART), before); assert.deepEqual(store.get("User", USER).address, userBefore.address);
  });
}
test("Overlapping checkouts cannot duplicate a cart and the same request key replays one order", async () => {
  const input = fixture();
  const results = await Promise.allSettled([createOrderFromCart(input), createOrderFromCart(input)]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(store.records.Order.size, 1); assert.equal(store.get("Product", PRODUCT).stock, 8);
  const replay = await createOrderFromCart(input); assert.equal(replay.replayed, true);
  assert.equal(store.records.Order.size, 1); assert.equal(store.records.Invoice.size, 1); assert.equal(store.get("Product", PRODUCT).stock, 8);
});
test("Archived cart items block checkout without reserving stock", async () => {
  const input = fixture(); await store.models.Product.updateOne({ _id: PRODUCT }, { $set: { isArchived: true } });
  await assert.rejects(createOrderFromCart(input), /no longer available/);
  assert.equal(store.records.Order.size, 0); assert.equal(store.get("Product", PRODUCT).stock, 10);
});
test("Unpaid cancellation restores inventory once, including a repeated request", async () => {
  const result = await createOrderFromCart(fixture());
  await cancelOrderAndRestoreStock(result.order, "Test cancellation"); await cancelOrderAndRestoreStock(result.order, "Repeat");
  assert.equal(store.get("Product", PRODUCT).stock, 10);
  assert.equal(store.get("Order", result.order._id).status, "cancelled");
  assert.equal(store.get("Invoice", result.invoice._id).paymentStatus, "cancelled");
});
test("COD fulfillment follows forward steps and records paid order/invoice on delivery", async () => {
  const { order, invoice } = await createOrderFromCart(fixture());
  await assert.rejects(updateOrderWorkflow(order._id, { status: "shipped" }), /cannot move/);
  for (const status of ["processing", "shipped", "delivered"]) await updateOrderWorkflow(order._id, { status });
  assert.equal(store.get("Order", order._id).isPaid, true); assert.equal(store.get("Invoice", invoice._id).paymentStatus, "paid");
  await assert.rejects(cancelOrderAndRestoreStock(order), /resolved|Only/);
});
test("Unpaid online orders cannot be fulfilled or manually marked paid", async () => {
  const { order } = await onlineFixture();
  await assert.rejects(updateOrderWorkflow(order._id, { status: "processing" }), /validated/);
  await assert.rejects(updateOrderWorkflow(order._id, { isPaid: true }), /gateway/);
});
test("Validated payment after cancellation is a review and never reopens/restocks fulfillment", async () => {
  const { order, invoice } = await onlineFixture(); await cancelOrderAndRestoreStock(order);
  const captured = await validateAndCapture("VALID-TRANSACTION", "VALIDATION");
  assert.equal(captured.review, true); assert.equal(captured.order.status, "cancelled"); assert.equal(captured.order.paymentStatus, "review");
  assert.equal(captured.order.isPaid, true); assert.equal(store.get("Product", PRODUCT).stock, 10);
  assert.equal(store.get("Invoice", invoice._id).paymentStatus, "review");
  await validateAndCapture("VALID-TRANSACTION", "VALIDATION"); await markPaymentUnsuccessful("VALID-TRANSACTION", "failed", "Out-of-order failure");
  assert.equal(store.get("Order", order._id).paymentStatus, "review"); assert.equal(store.get("Product", PRODUCT).stock, 10);
});
test("Valid online payment is monotonic across duplicate and later failure notifications", async () => {
  const { order, invoice } = await onlineFixture();
  await validateAndCapture("VALID-TRANSACTION", "VALIDATION");
  const paidAt = store.get("Order", order._id).paidAt;
  await validateAndCapture("VALID-TRANSACTION", "VALIDATION"); await markPaymentUnsuccessful("VALID-TRANSACTION", "cancelled", "Late cancellation");
  assert.equal(store.get("Order", order._id).status, "processing"); assert.equal(store.get("Order", order._id).paidAt, paidAt);
  assert.equal(store.get("Invoice", invoice._id).paymentStatus, "paid"); assert.equal(store.get("Product", PRODUCT).stock, 8);
});
test("Mismatched payment validation leaves the pending transaction unchanged", async () => {
  const { order } = await onlineFixture();
  gateway.validatePayment = async () => ({ status: "VALID", tran_id: "VALID-TRANSACTION", amount: 1, currency: "BDT", risk_level: 0 });
  const result = await validateAndCapture("VALID-TRANSACTION", "BAD-VALIDATION");
  assert.equal(result.ok, false); assert.equal(store.get("Order", order._id).paymentStatus, "pending");
});
test("A high-risk payment becomes a visible review and cannot enter fulfillment", async () => {
  const { order } = await onlineFixture();
  gateway.validatePayment = async () => ({ status: "VALID", tran_id: "VALID-TRANSACTION", amount: order.totalAmount, currency: "BDT", risk_level: 1 });
  const result = await validateAndCapture("VALID-TRANSACTION", "HIGH-RISK");
  assert.equal(result.review, true); assert.equal(result.order.isPaid, false);
  await assert.rejects(updateOrderWorkflow(order._id, { status: "processing" }), /validated/);
});
test("Cart read reprices without persisting a stale cart; mutations validate quantity", async () => {
  const input = fixture();
  const read = await jsonController(getCart, { user: input.user });
  assert.equal(read.data.items[0].price, 1000); assert.equal(store.get("Cart", CART).items[0].price, 1);
  const added = await jsonController(addToCart, { user: input.user, body: { productId: PRODUCT, quantity: 1 } });
  assert.equal(added.data.items[0].quantity, 3);
  const id = added.data.items[0]._id;
  const bad = await jsonController(updateCartItem, { user: input.user, params: { itemId: id }, body: { quantity: 1.5 } });
  assert.equal(bad.status, 400);
  const removed = await jsonController(removeCartItem, { user: input.user, params: { itemId: id } }); assert.equal(removed.data.items.length, 0);
});

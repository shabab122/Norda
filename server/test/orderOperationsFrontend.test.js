const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const client = path.join(__dirname, "../../client");
const read = (name) => fs.readFileSync(path.join(client, name), "utf8");
const id = "1234567890abcdef12345678";
const setup = (admin = false) => {
  let user = { _id: "buyer-one", role: admin ? "admin" : "user", name: "Buyer", email: "buyer@example.com" };
  const elements = new Map(), events = {}, storage = new Map();
  const element = () => ({ innerHTML: "", textContent: "", value: "", checked: false, disabled: false, hidden: false, dataset: {}, className: "", attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, addEventListener(name, fn) { this[name] = fn; }, reportValidity: () => true, querySelectorAll: () => [], querySelector: () => null, scrollIntoView() {} });
  const get = (name) => { if (!elements.has(name)) elements.set(name, element()); return elements.get(name); };
  const scope = vm.createContext({ console, URL, URLSearchParams, crypto, confirm: () => true, setTimeout() {},
    document: { body: { dataset: {} }, addEventListener(name, fn) { events[name] = fn; }, getElementById: get, querySelectorAll: () => [], querySelector: () => null },
    sessionStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    window: { addEventListener() {}, location: { pathname: admin ? "/admin/operations.html" : "/order-support.html", search: "?orderId=" + id, reload() {}, assign() {} }, print() {} },
    Api: { ready: Promise.resolve(), getUser: () => user, isLoggedIn: () => true, isAdmin: () => admin }, API_BASE_URL: "/api",
  });
  vm.runInContext(read("js/layout.js"), scope); vm.runInContext(read(admin ? "admin/operations.js" : "js/order-support.js"), scope);
  return { scope, events, get, storage, setUser: (value) => { user = value; } };
};
const order = { _id: id, createdAt: new Date().toISOString(), status: "processing", paymentMethod: "sslcommerz", paymentStatus: "paid", isPaid: true, totalAmount: 2120, refundedAmount: 0 };
const data = { order, requests: [], refunds: [], payments: [], events: [] };
test("Customer support escapes request/store text and distinguishes pending from completed refunds", () => {
  const { scope } = setup(); const html = scope.orderSupportHtml({ ...data, requests: [{ _id: id, type: "cancellation", status: "requested", reason: '<script>bad</script>', decisionMessage: '<img onerror="bad">', createdAt: order.createdAt }], refunds: [{ gateway: "sslcommerz", amount: 100, scope: "order", status: "pending", createdAt: order.createdAt }] });
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>bad|<img onerror/); assert.match(html, /Awaiting confirmation/); assert.doesNotMatch(html, /Refund completed/);
});
test("Return eligibility begins after delivery and a received/approved return cannot be requested twice", () => {
  const { scope } = setup(); assert.match(scope.orderSupportHtml(data), /value="cancellation"/); assert.doesNotMatch(scope.orderSupportHtml(data), /value="return"/);
  const delivered = { ...data, order: { ...order, status: "delivered" } }; assert.match(scope.orderSupportHtml(delivered), /Return all items/);
  assert.doesNotMatch(scope.orderSupportHtml({ ...delivered, order: { ...delivered.order, returnStatus: "received" } }), /id="support-form"/);
});
test("A customer double-click creates one request and an uncertain retry reuses its key", async () => {
  const { scope, get } = setup(); get("support-type").value = "cancellation"; get("support-reason").value = "Please cancel my order";
  const calls = []; let reject; scope.Api.post = async (url, body) => { calls.push({ url, body }); return new Promise((resolve, no) => { reject = no; }); };
  const first = scope.submitSupportRequest({ preventDefault() {} }); await scope.submitSupportRequest({ preventDefault() {} }); assert.equal(calls.length, 1); reject(new Error("Network timeout")); await first;
  scope.Api.post = async (url, body) => { calls.push({ url, body }); throw new Error("Network timeout"); }; await scope.submitSupportRequest({ preventDefault() {} });
  assert.equal(calls[0].body.requestKey, calls[1].body.requestKey); assert.equal(get("support-submit").disabled, false);
});
test("A stale customer response cannot render another account's order support", async () => {
  const { scope, get, setUser } = setup(); let done; scope.Api.get = async () => new Promise((resolve) => { done = resolve; }); const pending = scope.loadOrderSupport();
  setUser({ _id: "buyer-two", role: "user" }); done(data); await pending; assert.equal(get("support-root").innerHTML, "");
});
test("Admin detail escapes internal notes and provides explicit risky-payment and cash receipt controls", () => {
  const { scope } = setup(true);
  const html = scope.operationDetailHtml({ ...data, order: { ...order, paymentStatus: "review", paymentReviewReason: '<Risk "review">' }, requests: [], refunds: [{ _id: id, gateway: "manual", status: "pending", amount: 100, scope: "order", transactionId: "RF-CASH" }], events: [{ action: "admin_note", actorRole: "admin", note: '<script>private</script>', createdAt: order.createdAt }] });
  assert.match(html, /&lt;Risk &quot;review&quot;&gt;/); assert.match(html, /&lt;script&gt;private&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>private/); assert.match(html, /id="review-risk"/); assert.match(html, /name="confirmed" required/); assert.match(html, /Confirm completed cash refund/);
});
test("Unknown gateway refunds expose reconciliation rather than a blind resubmit button", () => {
  const { scope } = setup(true); const html = scope.refundOperationHtml({ _id: id, gateway: "sslcommerz", status: "unknown", amount: 100, scope: "order", transactionId: "RF-UNKNOWN" });
  assert.match(html, /Do not submit another refund/); assert.match(html, /name="amountVerified" required/); assert.match(html, /Reconcile existing refund/); assert.doesNotMatch(html, /data-manual-refund/);
});
test("Admin financial writes serialize and preserve their refund intent after a network timeout", async () => {
  const { scope, get, storage } = setup(true); vm.runInContext('operationsOrder = "' + id + '";', scope);
  get("refund-note").value = "Return the original amount"; get("refund-amount").value = "100";
  const calls = []; let reject; scope.Api.post = async (url, body) => { calls.push({ url, body }); return new Promise((resolve, no) => { reject = no; }); };
  const first = scope.submitAdminRefund({ preventDefault() {} }); await scope.submitAdminRefund({ preventDefault() {} }); assert.equal(calls.length, 1); reject(new Error("Network timeout")); await first;
  assert.equal(storage.size, 1); scope.Api.post = async (url, body) => { calls.push({ url, body }); throw new Error("Network timeout"); }; await scope.submitAdminRefund({ preventDefault() {} }); assert.equal(calls[0].body.requestKey, calls[1].body.requestKey);
  get("refund-note").value = "A different refund intent"; await scope.submitAdminRefund({ preventDefault() {} }); assert.equal(calls.length, 2); assert.match(get("operations-alert").textContent, /uncertain/);
});
test("Invoice keeps the original total while showing completed, pending and additional refunds separately", () => {
  const { scope, get } = setup(); vm.runInContext(read("js/invoice.js"), scope);
  scope.renderInvoice({ invoiceNumber: "INV-ORIGINAL", issuedAt: order.createdAt, totalAmount: 2120, subtotal: 2000, shippingFee: 120, paymentStatus: "paid", refundStatus: "partially_refunded", refundedAmount: 100, refundPendingAmount: 50, extraRefundedAmount: 2120, items: [{ name: "Lamp", quantity: 2, unitPrice: 1000, lineTotal: 2000 }], order: { status: "delivered", paymentMethod: "sslcommerz" } });
  const html = get("invoice-root").innerHTML; assert.match(html, /Original total/); assert.match(html, /Net after order refund/); assert.match(html, /Order refund pending/); assert.match(html, /Additional payment refunded/); assert.match(html, /INV-ORIGINAL/);
});

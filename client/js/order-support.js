let supportBusy = false;
const supportWords = (value) => String(value || "none").replace(/_/g, " ");
const supportRefundLabel = (value) => ({ awaiting_return: "Awaiting returned items — no payout yet", queued: "Queued", submitting: "Submitting", pending: "Awaiting confirmation", unknown: "Store reconciliation needed", succeeded: "Refund completed", failed: "Refund unsuccessful" }[value] || supportWords(value));
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; renderHeader("orders"); renderFooter();
  if (!requireShopper()) return;
  await loadOrderSupport();
});
const supportOrderId = () => new URLSearchParams(window.location.search).get("orderId") || "";
async function loadOrderSupport() {
  const root = document.getElementById("support-root"), id = supportOrderId(), account = shoppingIdentity();
  if (!/^[a-f0-9]{24}$/i.test(id)) { root.innerHTML = `<div class="empty-state"><h2>Order not found</h2><p>Open an order from your order history.</p></div>`; root.setAttribute("aria-busy", "false"); return; }
  try {
    const data = await Api.get("/orders/" + id + "/operations");
    if (account !== shoppingIdentity()) return;
    root.innerHTML = orderSupportHtml(data);
    root.setAttribute("aria-busy", "false");
    document.getElementById("support-form")?.addEventListener("submit", submitSupportRequest);
    document.getElementById("support-refresh")?.addEventListener("click", loadOrderSupport);
  } catch (error) {
    if (account !== shoppingIdentity()) return;
    root.innerHTML = `<div class="empty-state"><h2>Order support unavailable</h2><p>${escapeHtml(error.message)}</p><a class="btn btn-outline" href="orders.html">My orders</a></div>`; root.setAttribute("aria-busy", "false");
  }
}
function orderSupportHtml(data) {
  const { order, requests, refunds } = data;
  const refundActive = ["pending", "unknown", "partially_refunded", "refunded"].includes(order.refundStatus);
  const canCancel = !refundActive && ["pending", "processing"].includes(order.status) && [undefined, "none", "rejected"].includes(order.cancellationStatus);
  const canReturn = !refundActive && order.status === "delivered" && order.isPaid && [undefined, "none", "rejected"].includes(order.returnStatus);
  return `<div class="operations-grid"><div>
    <section class="operations-card"><h2>${canCancel || canReturn ? "How can we help?" : "Your request updates"}</h2>
      ${order.paymentMethod === "demo" ? `<div class="operations-banner">This order uses simulated payment. Refund updates do not transfer real money.</div>` : ""}
      ${canCancel || canReturn ? `<form id="support-form"><label for="support-type">Request</label><select id="support-type" required>${canCancel ? `<option value="cancellation">Cancel this order before shipment</option>` : ""}${canReturn ? `<option value="return">Return all items in this order</option>` : ""}</select>
        <p class="operations-muted">The store reviews each request. A return covers every item in this order. Refund processing begins after cancellation approval or the store receives your approved return.</p>
        <label for="support-reason">Tell us the reason</label><textarea id="support-reason" minlength="5" maxlength="1000" required placeholder="Describe what you need help with"></textarea>
        <div class="operations-actions"><button class="btn btn-primary" id="support-submit" type="submit">Send request</button></div></form>` : `<p>No new cancellation or return request is available for this order right now. Existing requests and refunds remain visible below.</p>`}
    </section>
    <section class="operations-card"><h2>Request history</h2>${requests.length ? requests.map((item) => `<article class="operations-history"><span class="operations-badge">${escapeHtml(supportWords(item.status))}</span><h3>${item.type === "return" ? "Full-order return" : "Cancellation request"}</h3><small>${escapeHtml(formatDate(item.createdAt, true))}</small><p>${escapeHtml(item.reason)}</p>${item.decisionMessage ? `<p><strong>Store update:</strong> ${escapeHtml(item.decisionMessage)}</p>` : ""}${item.receivedAt ? `<small>Received ${escapeHtml(formatDate(item.receivedAt, true))}${item.restocked ? " · Returned to stock" : " · Not returned to sellable stock"}</small>` : ""}</article>`).join("") : `<p class="operations-empty">You have not submitted a request for this order.</p>`}</section>
    <section class="operations-card"><h2>Refund history</h2>${order.status === "delivered" ? `<p><a class="text-link" href="item-returns.html?orderId=${encodeURIComponent(order._id)}">Selected-item returns, exchanges & credit notes →</a></p>` : ""}${refunds.length ? refunds.map((item) => `<article class="operations-history"><span class="operations-badge ${["pending", "unknown", "submitting"].includes(item.status) ? "is-warning" : ""}">${escapeHtml(supportRefundLabel(item.status))}</span><h3>${money(item.amount)}${item.scope === "extra_payment" ? " · Additional payment" : ""}</h3><p>${item.gateway === "demo" ? "Simulated refund · No real transfer" : item.gateway === "manual" ? (item.status === "succeeded" ? "Cash/manual refund completed by the store" : "Cash/manual refund awaiting store confirmation") : "SSLCOMMERZ refund"}</p><small>${escapeHtml(formatDate(item.completedAt || item.createdAt, true))}</small></article>`).join("") : `<p class="operations-empty">No refund has been requested. A pending request is not a completed refund.</p>`}</section>
    </div><aside class="operations-card"><span class="eyebrow">Your order</span><h2>#${escapeHtml(order._id.slice(-8).toUpperCase())}</h2><dl>
      <div><dt>Order status</dt><dd>${escapeHtml(order.status)}</dd></div><div><dt>Payment</dt><dd>${escapeHtml(paymentLabel(order.paymentStatus))}</dd></div>
      <div><dt>Original total</dt><dd>${money(order.totalAmount)}</dd></div><div><dt>Order refund completed</dt><dd>${money(order.refundedAmount || 0)}</dd></div><div><dt>Order refund pending</dt><dd>${money(order.refundPendingAmount || 0)}</dd></div>
      ${order.extraRefundedAmount ? `<div><dt>Additional payment refunded</dt><dd>${money(order.extraRefundedAmount)}</dd></div>` : ""}</dl>
      <p>The invoice retains your original items and total, with refunds shown separately.</p><div class="operations-actions"><a class="btn btn-outline btn-sm" href="invoice.html?orderId=${encodeURIComponent(order._id)}">Open invoice</a><a class="btn btn-outline btn-sm" href="return-pickups.html?orderId=${encodeURIComponent(order._id)}">Return pickup & collection history</a><button class="btn btn-outline btn-sm" type="button" id="support-refresh">Refresh status</button></div>
    </aside></div>`;
}
async function submitSupportRequest(event) {
  event.preventDefault(); if (supportBusy) return;
  const id = supportOrderId(), account = shoppingIdentity(), type = document.getElementById("support-type").value, reason = document.getElementById("support-reason").value.trim();
  const alert = document.getElementById("support-alert"), button = document.getElementById("support-submit");
  const storageKey = "norda-order-request:" + account + ":" + id;
  let key;
  try {
    const previous = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    key = previous?.type === type && previous?.reason === reason ? previous.key : crypto.randomUUID();
    sessionStorage.setItem(storageKey, JSON.stringify({ type, reason, key }));
  } catch { alert.textContent = "Please allow browser session storage before sending a request."; return; }
  supportBusy = true; button.disabled = true; alert.textContent = "Sending your request…";
  try {
    await Api.post("/orders/" + id + "/requests", { type, reason, requestKey: key });
    if (account !== shoppingIdentity()) return;
    sessionStorage.removeItem(storageKey); alert.textContent = "Your request has been sent. The store's decision will appear here."; await loadOrderSupport();
  } catch (error) {
    if (account !== shoppingIdentity()) return;
    if (error.status >= 400 && error.status < 500) sessionStorage.removeItem(storageKey);
    alert.textContent = error.message; button.disabled = false;
  } finally { supportBusy = false; }
}


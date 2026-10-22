let operationsMode = "requests", operationsPage = 1, operationsLoad = 0, operationsOrder = "", operationsBusy = false;
const operationWords = (value) => String(value || "none").replace(/_/g, " ");
const operationEndpoint = "/admin/operations";
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; if (!requireAdmin()) return; renderAdminShell("operations");
  document.querySelectorAll("[data-operations-mode]").forEach((button) => button.addEventListener("click", async () => {
    operationsMode = button.dataset.operationsMode; operationsPage = 1; configureOperationFilters(); await loadOperationsQueue();
  }));
  document.getElementById("operations-status").addEventListener("change", () => { operationsPage = 1; loadOperationsQueue(); });
  document.getElementById("operations-refresh").addEventListener("click", loadOperationsQueue);
  configureOperationFilters(); await loadOperationsQueue();
  const orderId = new URLSearchParams(window.location.search).get("orderId");
  if (orderId && /^[a-f0-9]{24}$/i.test(orderId)) await loadOperationDetail(orderId);
});
function configureOperationFilters() {
  document.querySelectorAll("[data-operations-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.operationsMode === operationsMode));
  const filter = document.getElementById("operations-status");
  const states = operationsMode === "requests" ? ["requested", "approved", "received", "completed", "rejected"] : operationsMode === "refunds" ? ["awaiting_return", "queued", "submitting", "pending", "unknown", "succeeded", "failed"] : [];
  filter.innerHTML = '<option value="">All states</option>' + states.map((state) => `<option value="${state}">${escapeHtml(operationWords(state))}</option>`).join(""); filter.disabled = operationsMode === "reviews";
}
async function loadOperationsQueue() {
  const root = document.getElementById("operations-list"), account = Api.getUser()?._id, sequence = ++operationsLoad;
  try {
    const query = new URLSearchParams({ mode: operationsMode, page: String(operationsPage), limit: "15" });
    const status = document.getElementById("operations-status").value; if (status && operationsMode !== "reviews") query.set("status", status);
    const data = await Api.get(operationEndpoint + "?" + query);
    if (sequence !== operationsLoad || account !== Api.getUser()?._id) return;
    root.innerHTML = data.items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Operation</th><th>Status</th><th>Action</th></tr></thead><tbody>${data.items.map((item) => {
      const orderId = operationsMode === "reviews" ? item._id : item.order?._id || item.order;
      return `<tr><td><strong>#${escapeHtml(String(orderId).slice(-8).toUpperCase())}</strong><small>${escapeHtml(formatDate(item.createdAt, true))}</small></td><td>${escapeHtml(item.user?.name || "Customer")}<small>${escapeHtml(item.user?.email || "")}</small></td><td>${escapeHtml(operationsMode === "reviews" ? "Payment review" : operationsMode === "refunds" ? "Refund · " + money(item.amount) : operationWords(item.type))}</td><td><span class="operations-badge">${escapeHtml(operationsMode === "reviews" ? "Needs review" : operationWords(item.status))}</span></td><td><button class="btn btn-outline btn-sm" type="button" data-operation-order="${escapeHtml(orderId)}">Open order</button></td></tr>`;
    }).join("")}</tbody></table></div>` : '<p class="operations-empty">No operations match this queue.</p>';
    root.innerHTML += `<nav class="operations-pagination" aria-label="Operations pages"><span>${data.total} records · Page ${data.page} of ${data.pages}</span><div><button class="btn btn-outline btn-sm" data-operation-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Previous</button> <button class="btn btn-outline btn-sm" data-operation-page="${data.page + 1}" ${data.page >= data.pages ? "disabled" : ""}>Next</button></div></nav>`;
    root.querySelectorAll("[data-operation-order]").forEach((button) => button.addEventListener("click", () => loadOperationDetail(button.dataset.operationOrder)));
    root.querySelectorAll("[data-operation-page]").forEach((button) => button.addEventListener("click", () => { operationsPage = Number(button.dataset.operationPage); loadOperationsQueue(); }));
  } catch (error) { if (account === Api.getUser()?._id && sequence === operationsLoad) root.innerHTML = `<p class="alert alert-error">${escapeHtml(error.message)}</p>`; }
}
async function loadOperationDetail(id) {
  operationsOrder = id; const account = Api.getUser()?._id, root = document.getElementById("operations-detail");
  try {
    const data = await Api.get(operationEndpoint + "/orders/" + id);
    if (account !== Api.getUser()?._id || id !== operationsOrder) return;
    const pendingStorage = "norda-admin-refund:" + account + ":" + id;
    try { const saved = JSON.parse(sessionStorage.getItem(pendingStorage) || "null"); if (saved && data.refunds.some((r) => r.requestKey === saved.key)) sessionStorage.removeItem(pendingStorage); } catch { /* An existing request can still be retried. */ }
    root.hidden = false; root.innerHTML = operationDetailHtml(data); bindOperationDetail(root); root.scrollIntoView({ block: "start" });
  } catch (error) { if (account === Api.getUser()?._id && id === operationsOrder) showOperationsAlert(error.message, true); }
}
function operationPaymentOptions(payments, order = {}) {
  const choices = [];
  for (const payment of payments.filter((p) => ["paid", "review"].includes(p.status))) {
    const validations = [...new Set([payment.validationId || "", ...(payment.duplicateValidationIds || [])])];
    for (const validationId of validations) choices.push(`<option value="${escapeHtml(JSON.stringify({ paymentId: payment._id, validationId }))}" ${String(order.settledPayment || "") === String(payment._id) && order.settledValidationId === validationId ? "selected" : ""}>${escapeHtml(payment.transactionId)} · ${money(payment.amount)}${validationId ? " · " + escapeHtml(validationId) : " · Simulated"}</option>`);
  }
  return choices.join("") || '<option value="">Recorded cash payment</option>';
}
function operationDetailHtml(data) {
  const { order, payments, requests, refunds, events } = data, options = operationPaymentOptions(payments, order);
  return `<div class="operations-card"><span class="eyebrow">Order #${escapeHtml(order._id.slice(-8).toUpperCase())}</span><h2>Order operations</h2><p>${escapeHtml(order.status)} · ${escapeHtml(paymentLabel(order.paymentStatus))} · ${money(order.totalAmount)}${order.paymentMethod === "demo" ? " · Simulated payment, no real money" : ""}</p>
    <dl><div><dt>Order refund completed</dt><dd>${money(order.refundedAmount || 0)}</dd></div><div><dt>Order refund pending</dt><dd>${money(order.refundPendingAmount || 0)}</dd></div><div><dt>Additional payments refunded</dt><dd>${money(order.extraRefundedAmount || 0)}</dd></div></dl><div class="operations-actions"><a class="btn btn-outline btn-sm" href="../invoice.html?orderId=${encodeURIComponent(order._id)}">View invoice</a><a class="btn btn-outline btn-sm" href="item-returns.html?orderId=${encodeURIComponent(order._id)}">Item returns & exchanges</a><button class="btn btn-outline btn-sm" type="button" data-detail-refresh>Refresh order</button></div></div>
    <div class="operations-finance"><section class="operations-card"><h2>Payment review & notes</h2>${order.paymentReviewReason ? `<div class="operations-banner">${escapeHtml(order.paymentReviewReason)}</div>` : ""}<form id="operation-review-form">
      <label for="review-payment">Payment / validated charge</label><select id="review-payment">${options}</select>
      <label for="review-note">Internal audit note</label><textarea id="review-note" minlength="5" maxlength="1000" required></textarea><label class="operations-check"><input id="review-risk" type="checkbox" />I have investigated and accept the gateway's risk flag, if present.</label>
      <div class="operations-actions"><button class="btn btn-outline btn-sm" type="button" data-review-action="verify">Verify gateway history</button>${order.paymentStatus === "review" ? `<button class="btn btn-outline btn-sm" type="button" data-review-action="retain">Retain selected charge</button><button class="btn btn-primary btn-sm" type="button" data-review-action="approve">Approve retained payment</button><button class="btn btn-outline btn-sm" type="button" data-review-action="close_refunded">Close fully refunded review</button>` : ""}<button class="btn btn-outline btn-sm" type="button" data-review-action="note">Save note</button></div></form><p>Approval requires a verified retained payment. Refund additional charges first. An expired order must have stock available before fulfillment can reopen.</p>
      <h3>Transaction history</h3>${payments.map((p) => `<article class="operations-history"><strong>${escapeHtml(p.transactionId)}</strong><span class="operations-reference">${escapeHtml(p.gateway || "sslcommerz")} · ${escapeHtml(p.status)} · ${money(p.amount)} · Risk ${Number(p.riskLevel || 0)}</span>${p.bankTransactionId ? `<span class="operations-reference">Bank: ${escapeHtml(p.bankTransactionId)}</span>` : ""}${p.failureReason ? `<p>${escapeHtml(p.failureReason)}</p>` : ""}${p.duplicateValidationIds.length ? `<small>${p.duplicateValidationIds.length} additional validation reference(s) recorded</small>` : ""}</article>`).join("") || '<p class="operations-empty">Cash payment is recorded on the order.</p>'}</section>
    <section class="operations-card"><h2>Request a refund</h2><p>Order refunds require approved cancellation or received returned goods. Additional captured charges have their own refund balance.</p><form id="operation-refund-form"><label for="refund-payment">Payment / charge to refund</label><select id="refund-payment">${options}</select><label for="refund-amount">Amount (BDT, optional)</label><input type="number" id="refund-amount" min="0.01" step="0.01" /><small>Leave blank for the remaining recorded balance.</small><label for="refund-note">Internal refund reason</label><textarea id="refund-note" minlength="5" maxlength="1000" required></textarea><div class="operations-actions"><button class="btn btn-primary" type="submit">Queue refund</button></div></form><p>Gateway acceptance means pending, not completed. Cash refunds need a receipt after the money is returned. Simulated refunds transfer no money.</p></section></div>
    <section class="operations-card"><h2>Customer requests</h2>${requests.map((r) => `<article class="operations-history"><span class="operations-badge">${escapeHtml(r.status)}</span><h3>${r.type === "return" ? "Full-order return" : "Cancellation"}</h3><p>${escapeHtml(r.reason)}</p>${r.decisionMessage ? `<p><strong>Customer message:</strong> ${escapeHtml(r.decisionMessage)}</p>` : ""}
      ${r.status === "requested" ? `<form data-request-decision="${escapeHtml(r._id)}"><label for="decision-${escapeHtml(r._id)}">Decision message for customer</label><textarea id="decision-${escapeHtml(r._id)}" minlength="5" maxlength="1000" required></textarea><div class="operations-actions"><button class="btn btn-primary btn-sm" type="button" data-decide="approve">${r.type === "cancellation" ? "Approve cancellation & refund if paid" : "Approve return"}</button><button class="btn btn-outline btn-sm" type="button" data-decide="reject">Reject request</button></div></form>` : ""}
      ${r.type === "return" && r.status === "approved" ? `<form data-return-receive="${escapeHtml(r._id)}"><label class="operations-check"><input type="checkbox" name="received" required />All items in this return have physically arrived.</label><label for="restock-${escapeHtml(r._id)}">Inventory decision</label><select id="restock-${escapeHtml(r._id)}" name="restock" required><option value="">Choose after inspection…</option><option value="yes">Restock all returned items</option><option value="no">Do not restock (damaged/unsellable)</option></select><label for="received-note-${escapeHtml(r._id)}">Customer update</label><textarea id="received-note-${escapeHtml(r._id)}" name="note" minlength="5" maxlength="1000" required></textarea><div class="operations-actions"><button class="btn btn-primary btn-sm" type="submit">Record receipt & queue refund</button></div></form>` : ""}</article>`).join("") || '<p class="operations-empty">No customer requests.</p>'}</section>
    <section class="operations-card"><h2>Refund ledger</h2>${refunds.map((r) => refundOperationHtml(r)).join("") || '<p class="operations-empty">No refunds recorded.</p>'}</section>
    <section class="operations-card"><h2>Audit history</h2>${events.map((item) => `<article class="operations-history"><strong>${escapeHtml(operationWords(item.action))}</strong><small class="operations-reference">${escapeHtml(formatDate(item.createdAt, true))} · ${escapeHtml(item.actor?.name || item.actorRole || "system")}</small><p>${escapeHtml(item.note)}</p></article>`).join("") || '<p class="operations-empty">New review and request decisions will appear here.</p>'}</section>`;
}
function refundOperationHtml(refund) {
  const id = escapeHtml(refund._id);
  return `<article class="operations-history"><span class="operations-badge ${["unknown", "submitting", "pending"].includes(refund.status) ? "is-warning" : ""}">${escapeHtml(operationWords(refund.status))}</span><h3>${money(refund.amount)} · ${escapeHtml(operationWords(refund.scope))}</h3><small class="operations-reference">${escapeHtml(refund.gateway)} · ${escapeHtml(refund.transactionId)}${refund.refundReference ? " · Provider " + escapeHtml(refund.refundReference) : ""}</small>${refund.failureReason ? `<p>${escapeHtml(refund.failureReason)}</p>` : ""}
    ${refund.gateway === "manual" && refund.status === "pending" ? `<form data-manual-refund="${id}"><label for="cash-reference-${id}">Receipt/reference</label><input id="cash-reference-${id}" name="reference" minlength="3" maxlength="120" required /><label for="cash-note-${id}">Audit note</label><textarea id="cash-note-${id}" name="note" minlength="5" maxlength="1000" required></textarea><label class="operations-check"><input type="checkbox" name="confirmed" required />I have actually returned ${money(refund.amount)} to the customer.</label><div class="operations-actions"><button class="btn btn-primary btn-sm" type="submit">Confirm completed cash refund</button></div></form>` : ""}
    ${refund.gateway === "sslcommerz" && ["pending", "unknown", "submitting", "failed"].includes(refund.status) ? refund.refundReference ? `<div class="operations-actions"><button class="btn btn-outline btn-sm" type="button" data-sync-refund="${id}">Check provider status</button></div>` : ["unknown", "submitting"].includes(refund.status) ? `<div class="operations-banner">Do not submit another refund. Recover the existing reference from the merchant portal.</div><form data-recover-refund="${id}"><label for="recover-reference-${id}">Existing provider refund reference</label><input id="recover-reference-${id}" name="refundReference" maxlength="100" required /><label for="recover-amount-${id}">Exact amount verified in merchant portal</label><input id="recover-amount-${id}" name="confirmedAmount" type="number" min="0.01" step="0.01" required /><label for="recover-note-${id}">Evidence/audit note</label><textarea id="recover-note-${id}" name="note" minlength="5" maxlength="1000" required></textarea><label class="operations-check"><input type="checkbox" name="amountVerified" required />I verified the original bank transaction, reference and exact refund amount.</label><div class="operations-actions"><button class="btn btn-outline btn-sm" type="submit">Reconcile existing refund</button></div></form>` : "" : ""}
    ${refund.gateway === "demo" ? '<p>Simulated refund · No real money transferred.</p>' : ""}</article>`;
}
function bindOperationDetail(root) {
  root.querySelector("[data-detail-refresh]")?.addEventListener("click", () => loadOperationDetail(operationsOrder));
  root.querySelectorAll("[data-review-action]").forEach((button) => button.addEventListener("click", () => {
    const form = document.getElementById("operation-review-form"); if (!form.reportValidity()) return;
    const source = JSON.parse(document.getElementById("review-payment").value || "{}");
    mutateOperation("/orders/" + operationsOrder + "/review", { ...source, action: button.dataset.reviewAction, note: document.getElementById("review-note").value.trim(), acknowledgeRisk: document.getElementById("review-risk").checked });
  }));
  document.getElementById("operation-refund-form").addEventListener("submit", submitAdminRefund);
  root.querySelectorAll("[data-request-decision]").forEach((form) => form.querySelectorAll("[data-decide]").forEach((button) => button.addEventListener("click", () => {
    if (!form.reportValidity()) return;
    if (button.dataset.decide === "approve" && !confirm("Approve this request? Paid cancellations queue a refund; return approval waits for receipt of the goods.")) return;
    mutateOperation("/requests/" + form.dataset.requestDecision + "/decision", { decision: button.dataset.decide, note: form.querySelector("textarea").value.trim() });
  })));
  root.querySelectorAll("[data-return-receive]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); if (!form.reportValidity()) return; mutateOperation("/requests/" + form.dataset.returnReceive + "/receive", { received: form.elements.received.checked, restock: form.elements.restock.value === "yes", note: form.elements.note.value.trim() }); }));
  root.querySelectorAll("[data-manual-refund]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); if (!form.reportValidity()) return; mutateOperation("/refunds/" + form.dataset.manualRefund + "/confirm", { confirmed: form.elements.confirmed.checked, reference: form.elements.reference.value.trim(), note: form.elements.note.value.trim() }); }));
  root.querySelectorAll("[data-sync-refund]").forEach((button) => button.addEventListener("click", () => mutateOperation("/refunds/" + button.dataset.syncRefund + "/reconcile", {})));
  root.querySelectorAll("[data-recover-refund]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); if (!form.reportValidity()) return; mutateOperation("/refunds/" + form.dataset.recoverRefund + "/reconcile", { refundReference: form.elements.refundReference.value.trim(), confirmedAmount: form.elements.confirmedAmount.value, amountVerified: form.elements.amountVerified.checked, note: form.elements.note.value.trim() }); }));
}
async function submitAdminRefund(event) {
  event.preventDefault(); if (operationsBusy) return;
  const form = document.getElementById("operation-refund-form"); if (!form.reportValidity()) return;
  const account = Api.getUser()?._id, storageKey = "norda-admin-refund:" + account + ":" + operationsOrder;
  const source = JSON.parse(document.getElementById("refund-payment").value || "{}");
  const body = { ...source, note: document.getElementById("refund-note").value.trim() };
  const amount = document.getElementById("refund-amount").value; if (amount) body.amount = amount;
  const signature = JSON.stringify(body);
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (saved && saved.signature !== signature) { showOperationsAlert("An earlier refund request is uncertain. Refresh the order or retry its exact details before starting a different refund.", true); return; }
    body.requestKey = saved?.key || crypto.randomUUID();
    if (!confirm("Queue this refund? SSLCOMMERZ will receive a real refund request. Cash refunds require confirmation after money is returned. Simulated refunds transfer no money.")) return;
    sessionStorage.setItem(storageKey, JSON.stringify({ key: body.requestKey, signature }));
  } catch { showOperationsAlert("Allow browser session storage before requesting a refund.", true); return; }
  await mutateOperation("/orders/" + operationsOrder + "/refunds", body, storageKey);
}
async function mutateOperation(path, body, storageKey) {
  if (operationsBusy) return;
  operationsBusy = true; const account = Api.getUser()?._id, orderId = operationsOrder;
  const buttons = [...document.getElementById("operations-detail").querySelectorAll("button")]; buttons.forEach((b) => { b.disabled = true; });
  showOperationsAlert("Saving the operation and checking its recorded state…");
  try {
    await Api.post(operationEndpoint + path, body);
    if (account !== Api.getUser()?._id) return;
    if (storageKey) sessionStorage.removeItem(storageKey);
    showOperationsAlert("Operation recorded. Check the current status below; pending refunds are not completed transfers.");
    await loadOperationsQueue(); if (operationsOrder === orderId) await loadOperationDetail(orderId);
  } catch (error) {
    if (account !== Api.getUser()?._id) return;
    if (storageKey && error.status >= 400 && error.status < 500) sessionStorage.removeItem(storageKey);
    showOperationsAlert(error.message + " Refresh the order before repeating an uncertain operation.", true);
    buttons.forEach((b) => { b.disabled = false; });
  } finally { operationsBusy = false; }
}
function showOperationsAlert(message, error = false) {
  const root = document.getElementById("operations-alert"); root.className = "operations-alert alert " + (error ? "alert-error" : "alert-info"); root.textContent = message;
}

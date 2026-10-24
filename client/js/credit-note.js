document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; renderHeader("orders"); renderFooter(); if (!requireShopper()) return;
  const button = document.getElementById("print-credit"), root = document.getElementById("credit-root");
  button.disabled = true;
  const id = new URLSearchParams(window.location.search).get("id"), owner = shoppingIdentity();
  if (!/^[a-f0-9]{24}$/i.test(id || "")) { root.textContent = "Open a credit note from your return or exchange request."; return; }
  try {
    const c = await Api.get("/credit-notes/" + id); if (owner !== shoppingIdentity()) return;
    document.title = c.number + " — Norda credit note";
    root.innerHTML = `<div class="management-credit-head"><div>${brandLogoHtml("", "invoice-brand")}<h1>Credit note</h1><p>${escapeHtml(c.number)}</p></div><div><p>Original invoice: <strong>${escapeHtml(c.invoiceNumber)}</strong></p><p>Issued: ${escapeHtml(formatDate(c.issuedAt, true))}</p>${managementStatus(c.status)}</div></div><p class="management-muted">Order #${escapeHtml(String(c.order).slice(-8).toUpperCase())} · ${escapeHtml(c.currency)}<br>${c.kind === "exchange_adjustment" ? "This credit note records the exchange price difference." : "This credit note records returned merchandise."} A pending credit does not confirm a completed refund.</p>${managementTable(["Returned item", "Quantity", "Gross", "Coupon allocation", "Credit"], c.items.map(i => [escapeHtml(i.name) + `<small>${escapeHtml(i.sku)}</small>`, i.quantity, money(i.grossAmount), money(i.discountAmount), money(i.creditAmount)]))}<div class="management-actions"><h2>Total credit: ${money(c.totalAmount)}</h2></div><p>Delivery fee credit: ${money(c.shippingCredit)}</p>${c.settledAt ? `<p>Refund settled: ${escapeHtml(formatDate(c.settledAt, true))}</p>` : '<p>Refund is awaiting confirmation.</p>'}<p class="management-muted">Your original invoice remains intact. This document records its separate merchandise adjustment.</p>`;
    bindReceiptPrint(button, root); button.disabled = false;
  } catch (error) { if (owner !== shoppingIdentity()) return; root.textContent = "This credit note could not be loaded. Return to your orders and try again."; managementAlert(error.message, "error"); }
});

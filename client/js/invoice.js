document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader("orders");
  renderFooter();
  if (!requireLogin()) return;
  const orderId = new URLSearchParams(window.location.search).get("orderId");
  const root = document.getElementById("invoice-root");
  if (!orderId) {
    root.innerHTML = `<div class="empty-state"><h1>Invoice not found</h1><a class="btn btn-primary" href="orders.html">View orders</a></div>`;
    return;
  }
  try {
    const invoice = await Api.get("/invoices/order/" + encodeURIComponent(orderId));
    renderInvoice(invoice);
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><h1>Invoice unavailable</h1><p>${escapeHtml(error.message)}</p><a class="btn btn-primary" href="orders.html">View orders</a></div>`;
  }
});

function renderInvoice(invoice) {
  document.title = invoice.invoiceNumber + " — Norda";
  const address = invoice.shippingAddress || {};
  document.getElementById("invoice-root").innerHTML = `
    <div class="invoice-actions no-print">
      <a href="orders.html" class="text-link">← Back to orders</a>
      <button type="button" class="btn btn-primary btn-sm" id="print-invoice">Print or save PDF</button>
    </div>
    <article class="invoice-sheet">
      <header class="invoice-header">
        ${brandLogoHtml()}
        <div><span>Invoice</span><h1>${escapeHtml(invoice.invoiceNumber)}</h1></div>
      </header>
      <div class="invoice-meta">
        <div><span>Issued</span><strong>${formatDate(invoice.issuedAt)}</strong></div>
        <div><span>Payment</span><strong class="status-pill payment-${escapeHtml(invoice.paymentStatus)}">${escapeHtml(paymentLabel(invoice.paymentStatus))}</strong>${invoice.order?.paymentMethod === "demo" ? `<small class="payment-context">Simulated payment · No real charge</small>` : ""}</div>
        <div><span>Order status</span><strong>${escapeHtml(invoice.order?.status || "pending")}</strong>${invoice.returnStatus && invoice.returnStatus !== "none" ? `<small class="payment-context">Return: ${escapeHtml(invoice.returnStatus)}</small>` : ""}</div>
      </div>
      <div class="invoice-addresses">
        <div>
          <span>Billed to</span>
          <strong>${escapeHtml(invoice.user?.name || "Customer")}</strong>
          <p>${escapeHtml(invoice.user?.email || "")}</p>
        </div>
        <div>
          <span>Deliver to</span>
          <strong>${escapeHtml(address.line1 || "")}</strong>
          ${address.line2 ? `<p>${escapeHtml(address.line2)}</p>` : ""}
          <p>${escapeHtml([address.city, address.district, address.postCode].filter(Boolean).join(", "))}</p>
          <p>${escapeHtml(address.country || "Bangladesh")} · ${escapeHtml(address.phone || "")}</p>
        </div>
      </div>
      <div class="invoice-table-wrap">
        <table class="invoice-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
          <tbody>
            ${invoice.items
              .map(
                (item) => `<tr><td>${escapeHtml(item.name)}${item.variantId ? `<br /><small>${escapeHtml(variantLabel(item))}</small>` : ""}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.lineTotal)}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="invoice-totals">
        <div><span>Subtotal</span><strong>${money(invoice.subtotal)}</strong></div>
        ${invoice.discountAmount > 0 ? `<div><span>Coupon ${escapeHtml(invoice.coupon?.code || "")}</span><strong>−${money(invoice.discountAmount)}</strong></div>` : ""}
        <div><span>Delivery</span><strong>${invoice.shippingFee ? money(invoice.shippingFee) : "Free"}</strong></div>
        ${invoice.refundStatus && invoice.refundStatus !== "none" ? `<div><span>Refund status</span><strong>${escapeHtml(invoice.refundStatus.replace(/_/g, " "))}</strong></div>` : ""}
        ${invoice.refundedAmount ? `<div><span>Order refund completed</span><strong>${money(invoice.refundedAmount)}</strong></div><div><span>Net after order refund</span><strong>${money(Math.max(0, invoice.totalAmount - invoice.refundedAmount))}</strong></div>` : ""}
        ${invoice.refundPendingAmount ? `<div><span>Order refund pending</span><strong>${money(invoice.refundPendingAmount)}</strong></div>` : ""}
        ${invoice.extraRefundedAmount ? `<div><span>Additional payment refunded</span><strong>${money(invoice.extraRefundedAmount)}</strong></div>` : ""}
        <div class="grand-total"><span>${invoice.refundStatus && invoice.refundStatus !== "none" ? "Original total" : "Total"}</span><strong>${money(invoice.totalAmount)}</strong></div>
      </div>
      <footer class="invoice-foot">
        <p>Thank you for shopping with Norda.</p>
        <span>${invoice.order?.paymentMethod === "demo" ? "Payment was simulated; no money was transferred." : "This invoice was generated from the recorded order and payment state."}</span>
      </footer>
    </article>
  `;
  document.getElementById("print-invoice").addEventListener("click", () => window.print());
}

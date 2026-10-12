let invoicesPage = 1;

document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  if (!requireAdmin()) return;
  renderAdminShell("invoices");
  document.getElementById("payment-filter").addEventListener("change", () => { invoicesPage = 1; loadInvoices(); });
  await loadInvoices();
});

async function loadInvoices() {
  const root = document.getElementById("invoices-root");
  root.innerHTML = `<span class="spinner">Loading invoices…</span>`;
  try {
    const paymentStatus = document.getElementById("payment-filter").value;
    const query = new URLSearchParams({ limit: "25", page: String(invoicesPage) });
    if (paymentStatus) query.set("paymentStatus", paymentStatus);
    const data = await Api.get("/invoices?" + query.toString());
    if (!data.invoices.length) {
      root.innerHTML = `<div class="empty-state"><h2>No invoices found</h2><p>Invoices are created automatically with new orders.</p></div>`;
      return;
    }
    root.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Total</th><th>Payment</th><th>Order</th><th></th></tr></thead><tbody>${data.invoices
      .map((invoice) => {
        const orderId = invoice.order?._id || invoice.order;
        return `<tr><td><strong>${escapeHtml(invoice.invoiceNumber)}</strong></td><td>${escapeHtml(invoice.user?.name || "Deleted user")}<small>${escapeHtml(invoice.user?.email || "")}</small></td><td>${formatDate(invoice.issuedAt)}</td><td><strong>${money(invoice.totalAmount)}</strong></td><td><span class="status-pill payment-${escapeHtml(invoice.paymentStatus)}">${escapeHtml(paymentLabel(invoice.paymentStatus))}</span></td><td><span class="status-pill status-${escapeHtml(invoice.order?.status || "pending")}">${escapeHtml(invoice.order?.status || "pending")}</span></td><td><a class="btn btn-outline btn-sm" href="../invoice.html?orderId=${encodeURIComponent(orderId)}">Open</a></td></tr>`;
      }).join("")}</tbody></table></div>${invoicePagination(data.page, data.pages, data.total)}`;
    root.querySelectorAll("[data-invoices-page]").forEach((button) => button.addEventListener("click", () => { invoicesPage = Number(button.dataset.invoicesPage); loadInvoices(); }));
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><h2>Invoices unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function invoicePagination(page, pages, total) {
  if (pages <= 1) return "";
  return `<nav class="admin-pagination" aria-label="Invoice pages"><span>Page ${page} of ${pages} · ${total} invoices</span><div><button class="btn btn-outline btn-sm" data-invoices-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button><button class="btn btn-outline btn-sm" data-invoices-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Next</button></div></nav>`;
}

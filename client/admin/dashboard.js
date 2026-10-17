document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  if (!requireAdmin()) return;
  renderAdminShell("dashboard");
  document.getElementById("export-orders-btn").addEventListener("click", exportOrders);
  await loadDashboard();
});

async function loadDashboard() {
  const root = document.getElementById("dashboard-root");
  try {
    const summary = await Api.get("/admin/dashboard-summary");
    const statuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
    root.innerHTML = `
      ${summary.reviewPayments ? `<div class="alert alert-warning"><strong>${summary.reviewPayments} payment(s) need review.</strong> <a href="orders.html?paymentStatus=review">Open affected orders</a></div>` : ""}
      <div class="stat-grid">
        ${statCard("Revenue", money(summary.totalRevenue), "Paid orders, excluding test payments", "accent")}
        ${statCard("Orders", summary.totalOrders, `${summary.pendingOrders} awaiting action`)}
        ${statCard("Customers", summary.totalUsers, "Registered shoppers")}
        ${statCard("Products", summary.totalProducts, `${summary.totalCategories} categories · ${summary.totalBrands} brands`)}
        ${statCard("Invoices", summary.totalInvoices, "One per order")}
        ${statCard("Payment exceptions", summary.failedPayments + (summary.reviewPayments || 0), `${summary.failedPayments} incomplete · ${summary.reviewPayments || 0} need review`, summary.failedPayments || summary.reviewPayments ? "warning" : "")}
      </div>
      <div class="admin-dashboard-grid">
        <section class="admin-panel">
          <div class="panel-heading"><div><span class="eyebrow">Fulfillment</span><h2>Order status</h2></div><a href="orders.html" class="text-link">Manage orders →</a></div>
          <div class="status-breakdown">${statuses.map((status) => `<div><span class="status-pill status-${status}">${status}</span><strong>${summary.orderStatusCounts?.[status] || 0}</strong></div>`).join("")}</div>
        </section>
        <section class="admin-panel">
          <div class="panel-heading"><div><span class="eyebrow">Inventory</span><h2>Low stock</h2></div><a href="products.html" class="text-link">View products →</a></div>
          ${summary.lowStockProducts.length ? `<div class="compact-list">${summary.lowStockProducts.map((product) => `<div><span>${escapeHtml(product.name)}</span><strong class="${product.stock === 0 ? "danger-text" : ""}">${product.stock} left</strong></div>`).join("")}</div>` : `<p>Nothing is running low right now.</p>`}
        </section>
      </div>
      <section class="admin-panel admin-section-gap">
        <div class="panel-heading"><div><span class="eyebrow">Latest activity</span><h2>Recent orders</h2></div><a href="orders.html" class="text-link">View all →</a></div>
        ${summary.recentOrders.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>${summary.recentOrders.map((order) => `<tr><td><strong>#${order._id.slice(-8).toUpperCase()}</strong></td><td>${escapeHtml(order.user?.name || "Deleted user")}</td><td>${formatDate(order.createdAt)}</td><td>${money(order.totalAmount)}</td><td><span class="status-pill payment-${order.paymentStatus}">${escapeHtml(paymentLabel(order.paymentStatus))}</span>${order.paymentMethod === "demo" ? "<small>Test payment</small>" : ""}</td><td><span class="status-pill status-${order.status}">${escapeHtml(order.status)}</span></td></tr>`).join("")}</tbody></table></div>` : `<p>No orders yet.</p>`}
      </section>`;
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><h2>Dashboard unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function statCard(label, value, note, tone = "") {
  return `<article class="stat-card ${tone}"><span class="stat-label">${escapeHtml(label)}</span><strong class="stat-value">${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

async function exportOrders() {
  const button = document.getElementById("export-orders-btn");
  button.disabled = true;
  button.textContent = "Preparing CSV…";
  try { await Api.download("/admin/reports/orders.csv", "norda-orders.csv"); }
  catch (error) { alert(error.message); }
  finally { button.disabled = false; button.textContent = "Export orders CSV"; }
}

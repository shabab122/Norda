document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  if (!requireLogin()) return;
  if (Api.isAdmin()) { window.location.replace("admin/dashboard.html"); return; }
  renderHeader("dashboard"); renderFooter();
  await loadCustomerDashboard();
});

let dashboardSequence = 0;
async function loadCustomerDashboard() {
  const root = document.getElementById("customer-dashboard");
  const sequence = ++dashboardSequence; const accountId = Api.getUser()?._id;
  root.setAttribute("aria-busy", "true");
  try {
    const [profile, orders, cart] = await Promise.all([Api.get("/auth/profile"), Api.get("/orders/my"), Api.get("/cart")]);
    if (sequence !== dashboardSequence || accountId !== Api.getUser()?._id) return;
    if (profile._id !== accountId) { window.location.reload(); return; }
    Api.setSession(profile);
    renderHeader("dashboard");
    root.innerHTML = customerDashboardHtml(profile, orders, cart);
    root.setAttribute("aria-busy", "false");
  } catch (error) {
    if (sequence !== dashboardSequence || accountId !== Api.getUser()?._id) return;
    root.setAttribute("aria-busy", "false");
    root.innerHTML = `<div class="empty-state"><h1>Your account could not load</h1><p>${escapeHtml(error.message)}</p><button class="btn btn-primary" type="button" id="retry-dashboard">Try again</button></div>`;
    document.getElementById("retry-dashboard").addEventListener("click", loadCustomerDashboard);
  }
}

function customerDashboardHtml(profile, orders, cart) {
  const active = orders.filter((order) => ["pending", "processing", "shipped"].includes(order.status));
  const delivered = orders.filter((order) => order.status === "delivered");
  const count = (cart.items || []).filter((item) => !item.unavailable).reduce((sum, item) => sum + item.quantity, 0);
  const attention = active.filter((order) => order.paymentMethod !== "cod" && order.paymentStatus !== "paid");
  const address = profile.address || {};
  const addressLines = [address.line1, address.line2, [address.city, address.district, address.postCode].filter(Boolean).join(", "), address.country];
  return `
    <section class="customer-welcome" aria-labelledby="account-title">
      <div class="customer-identity"><span class="customer-avatar" aria-hidden="true">${escapeHtml(accountInitials(profile.name))}</span><div><span class="customer-label">Customer dashboard</span><h1 id="account-title">Welcome, ${escapeHtml(profile.name)}.</h1><p>${escapeHtml(profile.email)}</p></div></div>
      <a class="btn btn-soft" href="products.html">Explore the shop ${icon("arrow")}</a>
    </section>
    <nav class="customer-tabs" aria-label="Your account"><a href="dashboard.html" aria-current="page">Overview</a><a href="orders.html">My orders & invoices</a><a href="cart.html">My cart</a><a href="profile.html">Profile & security</a></nav>
    <section class="customer-stats" aria-label="Your shopping overview">
      ${customerStat("Orders placed", orders.length, "View your order history", "orders.html")}
      ${customerStat("Active orders", active.length, "Pending, processing or shipped", "orders.html")}
      ${customerStat("Delivered", delivered.length, "Open an order to leave a review", "orders.html")}
      ${customerStat("Items in cart", count, "Continue your selection", "cart.html")}
    </section>
    ${attention.length ? `<div class="alert alert-warning"><strong>${attention.length} online order${attention.length > 1 ? "s need" : " needs"} payment attention.</strong> <a href="orders.html">Check your orders</a> for the recorded status before placing another order.</div>` : ""}
    <div class="customer-content-grid">
      <section class="customer-panel" aria-labelledby="recent-orders-title"><div class="customer-panel-head"><div><span class="eyebrow">Your purchases</span><h2 id="recent-orders-title">Recent orders</h2></div><a href="orders.html" class="text-link">View all →</a></div>
        ${orders.length ? `<div class="customer-order-list">${orders.slice(0, 4).map(customerOrderPreview).join("")}</div>` : `<div class="customer-empty">${icon("bag")}<h3>Your first find is waiting.</h3><p>Once you place an order, its progress and invoice will appear here.</p><a href="products.html" class="btn btn-primary">Browse products</a></div>`}
      </section>
      <aside class="customer-side"><section class="customer-panel" aria-labelledby="delivery-title"><div class="customer-panel-head"><div><span class="eyebrow">Ready for checkout</span><h2 id="delivery-title">Delivery details</h2></div></div>
        ${address.line1 ? `<address>${addressLines.filter(Boolean).map((line) => `<span>${escapeHtml(line)}</span>`).join("")}${address.phone ? `<span>${escapeHtml(address.phone)}</span>` : ""}</address>` : `<p>Add your default delivery address to make your next checkout easier.</p>`}
        <a href="profile.html" class="text-link">${address.line1 ? "Edit delivery details" : "Add delivery address"} →</a>
      </section><section class="customer-panel customer-security"><span class="eyebrow">Account details</span><h2>Your account, clearly yours.</h2><p>Signed in as <strong>${escapeHtml(profile.name)}</strong><br><span>${escapeHtml(profile.email)}</span></p><a href="profile.html" class="text-link">Manage profile & password →</a></section></aside>
    </div>`;
}
function customerStat(label, value, note, href) {
  return `<a class="customer-stat" href="${href}"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(note)}</small></a>`;
}
function customerOrderPreview(order) {
  const first = order.items?.[0];
  return `<article class="customer-order"><div class="customer-order-image">${first?.image ? `<img src="${escapeHtml(resolveImage(first.image))}" alt="" loading="lazy" />` : icon("box")}</div><div class="customer-order-description"><a href="orders.html#order-${encodeURIComponent(order._id)}"><strong>Order #${escapeHtml(order._id.slice(-8).toUpperCase())}</strong></a><span>${order.paymentMethod === "demo" ? "Test payment · " : ""}${formatDate(order.createdAt)} · ${order.items?.length || 0} product${order.items?.length === 1 ? "" : "s"}</span><div class="customer-order-status"><span class="status-pill status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span><span class="status-pill payment-${escapeHtml(order.paymentStatus)}">${escapeHtml(paymentLabel(order.paymentStatus))}</span></div></div><div class="customer-order-total"><strong>${money(order.totalAmount)}</strong><a href="invoice.html?orderId=${encodeURIComponent(order._id)}" class="text-link">Invoice →</a></div></article>`;
}

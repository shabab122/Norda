document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader("orders");
  renderFooter();
  if (!requireLogin()) return;

  const params = new URLSearchParams(window.location.search);
  await loadOrders(params.get("placed"), params.get("invoice"));
});

async function loadOrders(justPlaced, invoiceNumber) {
  const root = document.getElementById("orders-root");
  try {
    const orders = await Api.get("/orders/my");
    const banner = justPlaced
      ? `<div class="order-confirmation"><span aria-hidden="true">✓</span><div><strong>Order placed successfully</strong><p>We reserved your items and created ${invoiceNumber ? `invoice ${escapeHtml(invoiceNumber)}` : "an invoice"}. Payment and delivery updates appear below.</p></div></div>`
      : "";

    if (orders.length === 0) {
      root.innerHTML = `${banner}<div class="empty-state"><h2>No orders yet</h2><p>Your future orders and invoices will appear here.</p><a class="btn btn-primary" href="products.html">Start shopping</a></div>`;
      return;
    }

    root.innerHTML = banner + orders.map(renderOrder).join("");
    const target = String(window.location.hash || "").slice(1);
    if (/^order-[a-f0-9]{24}$/i.test(target)) document.getElementById(target)?.scrollIntoView({ block: "start" });
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><h2>Orders unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderOrder(order) {
  const shortId = order._id.slice(-8).toUpperCase();
  const address = order.shippingAddress || {};
  return `
    <article class="order-card" id="order-${escapeHtml(order._id)}">
      <header class="order-head">
        <div>
          <span class="eyebrow">Order #${shortId}</span>
          <h2>${formatDate(order.createdAt, true)}</h2>
        </div>
        <div class="order-statuses">
          <span class="status-pill status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span>
          <span class="status-pill payment-${escapeHtml(order.paymentStatus)}">${escapeHtml(paymentLabel(order.paymentStatus))}</span>
        </div>
      </header>
      ${order.status !== "cancelled" ? `<div class="order-progress" aria-label="Order progress">${["pending", "processing", "shipped", "delivered"].map((status, index) => `<span class="${index <= ["pending", "processing", "shipped", "delivered"].indexOf(order.status) ? "complete" : ""}">${status === "pending" ? "Order received" : status}</span>`).join("")}</div>` : ""}
      <div class="order-body">
        <div class="order-products">
          ${order.items
            .map(
              (item) => `
                <div class="order-product">
                  <a class="order-product-image" href="product-detail.html?id=${encodeURIComponent(item.product)}">
                    ${item.image ? `<img src="${escapeHtml(resolveImage(item.image))}" alt="" />` : `<span>${escapeHtml(item.name.charAt(0))}</span>`}
                  </a>
                  <div>
                    <a href="product-detail.html?id=${encodeURIComponent(item.product)}"><strong>${escapeHtml(item.name)}</strong></a>
                    <small>Quantity ${item.quantity} · ${money(item.price)} each</small>
                    ${order.status === "delivered" ? `<a class="text-link" href="product-detail.html?id=${encodeURIComponent(item.product)}#write-review">Write a review</a>` : ""}
                  </div>
                  <strong>${money(item.price * item.quantity)}</strong>
                </div>`
            )
            .join("")}
        </div>
        <aside class="order-summary">
          <div><span>Payment method</span><strong>${escapeHtml(paymentMethodLabel(order))}</strong></div>
          <div><span>Deliver to</span><strong>${escapeHtml([address.city, address.district].filter(Boolean).join(", ") || "Saved address")}</strong></div>
          <div><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div>
          <div><span>Delivery</span><strong>${order.shippingFee ? money(order.shippingFee) : "Free"}</strong></div>
          <div class="order-total"><span>Total</span><strong>${money(order.totalAmount)}</strong></div>
          ${order.paymentMethod === "demo" ? `<p class="summary-note"><strong>DEMO</strong> · No real money was transferred.</p>${!order.isPaid && order.status !== "cancelled" ? `<a class="btn btn-primary btn-sm btn-block" href="demo-payment.html?orderId=${encodeURIComponent(order._id)}">Resume or cancel demo</a>` : ""}` : ""}
          <a class="btn btn-outline btn-sm btn-block" href="invoice.html?orderId=${encodeURIComponent(order._id)}">Open invoice</a>
        </aside>
      </div>
      ${order.paymentStatus === "review" ? `<p class="order-note"><strong>Payment needs review.</strong> The store will need to check this payment before taking further action.</p>` : ""}
      ${order.status === "cancelled" && order.cancelReason ? `<p class="order-note"><strong>Cancellation note:</strong> ${escapeHtml(order.cancelReason)}</p>` : ""}
    </article>`;
}

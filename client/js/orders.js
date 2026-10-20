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
    const account = Api.getUser()?._id;
    const orders = await Api.get("/orders/my");
    if (account !== Api.getUser()?._id) return;
    const banner = justPlaced
      ? `<div class="order-confirmation"><span aria-hidden="true">✓</span><div><strong>Order placed successfully</strong><p>We reserved your items and created ${invoiceNumber ? `invoice ${escapeHtml(invoiceNumber)}` : "an invoice"}. Payment and delivery updates appear below.</p></div></div>`
      : "";

    if (orders.length === 0) {
      root.innerHTML = `${banner}<div class="empty-state"><h2>No orders yet</h2><p>Your future orders and invoices will appear here.</p><a class="btn btn-primary" href="products.html">Start shopping</a></div>`;
      return;
    }

    root.innerHTML = banner + orders.map(renderOrder).join("");
    root.querySelectorAll("[data-payment-retry]").forEach((button) => button.addEventListener("click", () => retryOrderPayment(button)));
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
          ${order.paymentMethod === "demo" ? `<p class="payment-context">Simulated payment · No real charge</p>${!order.isPaid && order.status !== "cancelled" ? `<a class="btn btn-primary btn-sm btn-block" href="demo-payment.html?orderId=${encodeURIComponent(order._id)}">Resume or cancel payment</a>` : ""}` : ""}
          ${order.paymentRecovery?.reservationExpiresAt && !order.isPaid && order.paymentStatus !== "review" && order.status !== "cancelled" ? `<p class="payment-context">Items reserved until ${escapeHtml(formatDate(order.paymentRecovery.reservationExpiresAt, true))}. Unpaid reservations are released automatically.</p>` : ""}
          ${order.reservationExpiredAt ? `<p class="payment-context">Reservation expired. Items were released to stock.${order.paymentMethod === "sslcommerz" ? " Retry checks stock before opening payment." : " Add available items to your cart to place a new order."}</p>` : ""}
          ${order.paymentRecovery?.canRetry ? `<button type="button" class="btn btn-primary btn-sm btn-block" data-payment-retry="${escapeHtml(order._id)}">Retry or resume online payment</button><div data-retry-alert="${escapeHtml(order._id)}" role="status" aria-live="polite"></div>` : ""}
          <a class="btn btn-outline btn-sm btn-block" href="invoice.html?orderId=${encodeURIComponent(order._id)}">Open invoice</a>
        </aside>
      </div>
      ${order.paymentStatus === "review" ? `<p class="order-note"><strong>Payment needs review.</strong> The store will need to check this payment before taking further action.</p>` : ""}
      ${order.status === "cancelled" && order.cancelReason ? `<p class="order-note"><strong>Cancellation note:</strong> ${escapeHtml(paymentNote(order.cancelReason))}</p>` : ""}
    </article>`;
}

async function retryOrderPayment(button) {
  if (button.disabled) return;
  const orderId = button.dataset.paymentRetry;
  const account = Api.getUser()?._id;
  if (!account || !/^[a-f0-9]{24}$/i.test(orderId)) return;
  const storageKey = "norda-payment-retry:" + account + ":" + orderId;
  const alert = document.querySelector('[data-retry-alert="' + orderId + '"]');
  let retryKey;
  try {
    retryKey = sessionStorage.getItem(storageKey);
    if (!retryKey) { retryKey = crypto.randomUUID(); sessionStorage.setItem(storageKey, retryKey); }
  } catch {
    if (alert) alert.textContent = "Please allow browser session storage before retrying payment.";
    return;
  }
  button.disabled = true;
  if (alert) alert.textContent = "Checking the previous payment and available stock…";
  try {
    const result = await Api.post("/payments/sslcommerz/" + orderId + "/retry", { retryKey });
    if (account !== Api.getUser()?._id) return;
    if (result.alreadyPaid || result.review) {
      sessionStorage.removeItem(storageKey);
      window.location.assign("payment-result.html?orderId=" + encodeURIComponent(orderId));
      return;
    }
    const url = new URL(result.checkoutUrl);
    if (url.protocol !== "https:" || !(url.hostname === "sslcommerz.com" || url.hostname.endsWith(".sslcommerz.com"))) throw new Error("The payment link could not be verified. Please contact the store.");
    sessionStorage.removeItem(storageKey);
    window.location.assign(url.toString());
  } catch (error) {
    if (account !== Api.getUser()?._id) return;
    if (error.status >= 400 && error.status < 500) sessionStorage.removeItem(storageKey);
    if (alert) alert.textContent = error.message + " Your saved order and invoice are kept. Refresh your orders to see the latest status.";
    button.disabled = false;
  }
}

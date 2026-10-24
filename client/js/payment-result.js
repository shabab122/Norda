document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader();
  renderFooter();
  const params = new URLSearchParams(window.location.search);
  const callbackHint = params.get("status") || "unknown";
  const orderId = params.get("orderId") || "";
  const root = document.getElementById("payment-result");
  const owner = shoppingIdentity();
  let verifiedStatus = "unknown";
  let orderSummary = "";
  let isDemo = false;

  if (/^[a-f0-9]{24}$/i.test(orderId) && owner) {
    try {
      const order = await Api.get("/orders/" + encodeURIComponent(orderId));
      if (owner !== shoppingIdentity()) return;
      isDemo = order.paymentMethod === "demo";
      verifiedStatus = order.paymentStatus === "paid" ? "success" : order.paymentStatus === "review" ? "review" : order.reservationExpiredAt ? "expired" : order.paymentStatus;
      orderSummary = `
        <div class="result-order">
          <span>Order</span><strong>#${escapeHtml(order._id.slice(-8).toUpperCase())}</strong>
          <span>Amount</span><strong>${money(order.totalAmount)}</strong>
          <span>Payment</span><strong>${escapeHtml(paymentLabel(order.paymentStatus))}</strong>
        </div>
      `;
    } catch {
      if (shoppingIdentity() && owner !== shoppingIdentity()) return;
      verifiedStatus = "unknown";
    }
  }

  const content = {
    success: {
      kicker: "Payment confirmed",
      title: "Your order is paid.",
      copy: "We validated the transaction and your order is now being processed.",
      className: "success",
    },
    expired: {
      kicker: "Reservation expired", title: "Your reserved items were released.",
      copy: "Open My Orders to retry online payment on this order. We will check stock again before payment. Simulated payments require a new order.", className: "warning",
    },
    cancelled: {
      kicker: "Checkout cancelled",
      title: "Checkout was not completed.",
      copy: "Open My Orders to retry or resume online payment on the saved order. Unpaid reservations expire automatically.",
      className: "cancelled",
    },
    failed: {
      kicker: "Payment incomplete",
      title: "We could not confirm payment.",
      copy: "No successful payment was recorded. Open My Orders to retry online payment using the same order and invoice.",
      className: "failed",
    },
    review: {
      kicker: "Store review needed",
      title: "This payment needs a closer look.",
      copy: "A payment update was recorded, but the store needs to resolve it before taking further action. Check your order for the latest status.",
      className: "warning",
    },
    pending: {
      kicker: "Payment pending",
      title: "Payment is not confirmed yet.",
      copy: "The order is recorded, but it will not enter fulfillment until payment is validated.",
      className: "warning",
    },
  }[verifiedStatus] || null;

  const result = content || {
    kicker: "Payment update",
    title: "The payment status is unclear.",
    copy: callbackHint === "success"
      ? "The gateway returned you to Norda, but this screen could not verify the order. Check your order history or recover guest access before trying another payment."
      : "Check your order history or recover guest access before trying another payment.",
    className: "warning",
  };

  if (isDemo && content) {
    result.kicker = "Payment update";
    result.title = verifiedStatus === "success" ? "Payment completed." : result.title;
    result.copy = verifiedStatus === "success"
      ? "Your simulated payment is recorded on the order and invoice. No real money was transferred."
      : ["failed", "cancelled"].includes(verifiedStatus)
        ? "No money was charged. This order was cancelled and its items are available again."
        : "This payment is simulated. No real money is transferred. Check My Orders for its latest status.";
  }
  root.innerHTML = `
    <section class="result-card ${result.className}">
      <span class="result-mark" aria-hidden="true">${verifiedStatus === "success" ? "✓" : verifiedStatus === "cancelled" ? "—" : "!"}</span>
      <span class="eyebrow">${result.kicker}</span>
      <h1>${result.title}</h1>
      <p>${result.copy}</p>
      ${orderSummary}
      <div class="result-actions">
        <a class="btn btn-primary" href="orders.html">View my orders</a>
        ${verifiedStatus === "unknown" ? '<a class="text-link" href="guest-orders.html">Recover a guest order</a>' : ""}
        ${["pending", "unknown"].includes(verifiedStatus) ? `<button class="btn btn-outline" type="button" id="refresh-payment">Check again</button>` : `<a class="btn btn-outline" href="products.html">Continue shopping</a>`}
      </div>
    </section>
  `;
  document.getElementById("refresh-payment")?.addEventListener("click", () => window.location.reload());
});

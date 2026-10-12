document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader();
  renderFooter();
  const params = new URLSearchParams(window.location.search);
  const callbackHint = params.get("status") || "unknown";
  const orderId = params.get("orderId") || "";
  const root = document.getElementById("payment-result");
  let verifiedStatus = "unknown";
  let orderSummary = "";

  if (orderId && Api.isLoggedIn()) {
    try {
      const order = await Api.get("/orders/" + encodeURIComponent(orderId));
      verifiedStatus = order.paymentStatus === "paid" ? "success" : order.paymentStatus;
      orderSummary = `
        <div class="result-order">
          <span>Order</span><strong>#${order._id.slice(-8).toUpperCase()}</strong>
          <span>Amount</span><strong>${money(order.totalAmount)}</strong>
          <span>Payment</span><strong>${escapeHtml(paymentLabel(order.paymentStatus))}</strong>
        </div>
      `;
    } catch {
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
    cancelled: {
      kicker: "Checkout cancelled",
      title: "Checkout was not completed.",
      copy: "Check the saved order for the latest payment status. The store can review this attempt before cancelling the order.",
      className: "cancelled",
    },
    failed: {
      kicker: "Payment incomplete",
      title: "We could not confirm payment.",
      copy: "No successful payment was recorded. The unpaid order remains visible for review.",
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
      ? "The gateway returned you to Norda, but this screen could not verify the order. Sign in and check your order history."
      : "Check your order history before trying anything again.",
    className: "warning",
  };

  root.innerHTML = `
    <section class="result-card ${result.className}">
      <span class="result-mark" aria-hidden="true">${verifiedStatus === "success" ? "✓" : verifiedStatus === "cancelled" ? "—" : "!"}</span>
      <span class="eyebrow">${result.kicker}</span>
      <h1>${result.title}</h1>
      <p>${result.copy}</p>
      ${orderSummary}
      <div class="result-actions">
        <a class="btn btn-primary" href="orders.html">View my orders</a>
        ${["pending", "unknown"].includes(verifiedStatus) ? `<button class="btn btn-outline" type="button" id="refresh-payment">Check again</button>` : `<a class="btn btn-outline" href="products.html">Continue shopping</a>`}
      </div>
    </section>
  `;
  document.getElementById("refresh-payment")?.addEventListener("click", () => window.location.reload());
});

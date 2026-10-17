document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader(); renderFooter();
  if (!requireLogin()) return;
  await loadDemoPayment();
});

async function loadDemoPayment() {
  const root = document.getElementById("demo-payment-root");
  const id = new URLSearchParams(window.location.search).get("orderId") || "";
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    root.innerHTML = `<div class="empty-state"><h1>Demo payment not found</h1><a class="btn btn-primary" href="orders.html">My orders</a></div>`;
    return;
  }
  try {
    const account = Api.getUser()?._id;
    const session = await Api.get("/payments/demo/" + id);
    if (account !== Api.getUser()?._id) return;
    root.innerHTML = demoPaymentHtml(session);
    root.querySelectorAll("[data-demo-outcome]").forEach((button) => {
      button.addEventListener("click", () => submitDemoOutcome(id, button.dataset.demoOutcome));
    });
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><h1>Demo payment unavailable</h1><p>${escapeHtml(error.message)}</p><a class="btn btn-primary" href="orders.html">My orders</a></div>`;
  }
}

function demoPaymentHtml(session) {
  const mobile = session.channel === "mobile_banking";
  const terminal = session.status !== "initiated" || session.orderStatus === "cancelled";
  return `
    <section class="demo-gateway" aria-labelledby="demo-title">
      <div class="demo-gateway-head"><a class="logo" href="index.html">NOR<span>DA</span></a><span class="demo-tag">PAYMENT DEMO</span></div>
      <p class="demo-notice"><strong>Simulation only.</strong> This is Norda's local demo, separate from SSLCOMMERZ. No money is transferred. Never enter a real card number, PIN or OTP.</p>
      <div class="demo-gateway-grid">
        <div class="demo-main">
          <span class="eyebrow">${mobile ? "Mobile Banking" : "Card & Bank"}</span>
          <h1 id="demo-title">${mobile ? "bKash demo payment" : "Card / Bank demo payment"}</h1>
          <p>Explore the checkout experience with a simulated payment outcome.</p>
          <div class="demo-method ${mobile ? "demo-mobile" : "demo-card"}">
            <span class="demo-method-symbol" aria-hidden="true">${mobile ? "↗" : "▤"}</span>
            <div><strong>${mobile ? "Mobile Banking / bKash" : "Card / Bank"}</strong><span>Demo account · No payment details needed</span></div>
          </div>
          <div id="demo-payment-alert" role="status" aria-live="polite"></div>
          ${terminal ? `
            <div class="alert alert-info"><strong>Demo ${escapeHtml(session.orderStatus === "cancelled" && session.status === "initiated" ? "cancelled" : session.status)}</strong><p>This session has finished. Open your order to view its recorded status.</p></div>
            <a class="btn btn-primary btn-block" href="payment-result.html?orderId=${encodeURIComponent(session.orderId)}">View demo result</a>` : `
            <div class="demo-outcomes" role="group" aria-label="Simulate a payment outcome">
              <button class="btn btn-primary btn-block" type="button" data-demo-outcome="success">Simulate successful payment</button>
              <button class="btn btn-outline btn-block" type="button" data-demo-outcome="failure">Simulate failed payment</button>
              <button class="button-link demo-cancel" type="button" data-demo-outcome="cancel">Cancel demo payment</button>
            </div>
            <p class="summary-note">You can also return to My Orders and resume this demo later.</p>`}
        </div>
        <aside class="demo-order" aria-label="Demo order summary">
          <span class="eyebrow">Demo order</span><h2>${money(session.amount)}</h2>
          <dl><div><dt>Order</dt><dd>#${escapeHtml(session.orderId.slice(-8).toUpperCase())}</dd></div>
          <div><dt>Invoice</dt><dd>${escapeHtml(session.invoiceNumber)}</dd></div>
          <div><dt>Currency</dt><dd>${escapeHtml(session.currency)}</dd></div>
          <div><dt>Method</dt><dd>${mobile ? "Mobile Banking / bKash" : "Card / Bank"}</dd></div></dl>
          <p>Failure or cancellation releases this demo order's items. A successful demo is clearly marked on your order and invoice.</p>
          <a class="text-link" href="orders.html">← My orders</a>
        </aside>
      </div>
    </section>`;
}

async function submitDemoOutcome(id, outcome) {
  const root = document.getElementById("demo-payment-root");
  const buttons = [...root.querySelectorAll("[data-demo-outcome]")];
  if (buttons.some((button) => button.disabled)) return;
  buttons.forEach((button) => { button.disabled = true; });
  const alert = document.getElementById("demo-payment-alert");
  alert.innerHTML = `<p>Recording your demo result…</p>`;
  const account = Api.getUser()?._id;
  try {
    await Api.post("/payments/demo/" + id + "/complete", { outcome });
    if (account !== Api.getUser()?._id) return;
    window.location.assign("payment-result.html?orderId=" + encodeURIComponent(id));
  } catch (error) {
    if (account !== Api.getUser()?._id) return;
    alert.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)} <a href="orders.html">Check My Orders</a> for the saved status.</div>`;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

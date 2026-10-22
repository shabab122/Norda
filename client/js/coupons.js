document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; renderHeader("coupons"); renderFooter();
  const root = document.getElementById("tools-root");
  try {
    const items = await Api.get("/coupons");
    root.innerHTML = items.length ? `<div class="tools-grid">${items.map((coupon) => `<article class="tool-card"><span class="eyebrow">${coupon.type === "percentage" ? escapeHtml(coupon.value) + "% off" : money(coupon.value) + " off"}</span><h2>${escapeHtml(coupon.title)}</h2><code class="coupon-code">${escapeHtml(coupon.code)}</code><p>Minimum product subtotal: ${money(coupon.minSubtotal)}</p>${coupon.maxDiscount ? `<p>Maximum saving: ${money(coupon.maxDiscount)}</p>` : ""}<p class="tools-muted">Ends ${formatDate(coupon.endsAt, true)}${coupon.perUserLimit ? " · " + coupon.perUserLimit + " use(s) per account" : ""}</p><div class="tool-actions"><button type="button" class="btn btn-outline btn-sm" data-copy-code="${escapeHtml(coupon.code)}">Copy code</button><a class="btn btn-primary btn-sm" href="checkout.html?coupon=${encodeURIComponent(coupon.code)}">Use at checkout</a></div></article>`).join("")}</div><p class="tools-muted">One code per order. Offers apply to product subtotals; delivery is calculated after the discount. Availability and account limits are checked at checkout. Usage limits count created orders, including later cancellations.</p>` : `<div class="empty-state spacious"><h2>More good things are on the way</h2><p>There are no public offers at the moment. If you have a private code, apply it at checkout.</p><a class="btn btn-primary" href="products.html">Browse products</a></div>`;
    root.querySelectorAll("[data-copy-code]").forEach((button) => button.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(button.dataset.copyCode); toast("Coupon code copied"); }
      catch { toast("Your code is " + button.dataset.copyCode, "warning"); }
    }));
  } catch (error) { root.innerHTML = `<div class="empty-state"><h2>Offers unavailable</h2><p>${escapeHtml(error.message)}</p></div>`; }
});

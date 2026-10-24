let guestOrdersRead = 0, guestOrdersBusy = false, guestAccessToken = "";
const guestOrderAccount = () => Api.getUser()?._id || "";
async function guestOrderTask(button, work) {
  if (guestOrdersBusy) return;
  const account = guestOrderAccount(), guestId = Guest.current?.id;
  const current = () => account === guestOrderAccount() && guestId === Guest.current?.id;
  guestOrdersBusy = true; if (button) button.disabled = true;
  try { await work(current); }
  catch (error) { if (current()) managementAlert(error.message, "error"); }
  finally { guestOrdersBusy = false; if (button && account === guestOrderAccount()) button.disabled = false; }
}
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; renderHeader("orders"); renderFooter();
  const params = new URLSearchParams(window.location.search), selected = params.get("placed") || params.get("orderId");
  if (/^[a-f0-9]{24}$/i.test(selected || "")) document.getElementById("guest-recovery-order").value = selected;
  guestAccessToken = window.location.hash.slice(1);
  if (guestAccessToken) { history.replaceState(null, "", window.location.pathname + window.location.search); document.getElementById("guest-token-root").hidden = false; }
  document.getElementById("guest-orders-refresh").addEventListener("click", loadGuestOrders);
  document.getElementById("guest-open-link").addEventListener("click", event => guestOrderTask(event.currentTarget, async current => {
    const recovered = await Api.post("/guest/recover", { token: guestAccessToken }); if (!current()) return;
    Guest.current = recovered; guestAccessToken = ""; Guest.changed(); document.getElementById("guest-token-root").hidden = true;
    renderHeader("orders"); await loadGuestOrders();
  }));
  document.getElementById("guest-recovery-form").addEventListener("submit", event => {
    event.preventDefault(); return guestOrderTask(event.currentTarget.querySelector("button"), async current => {
      const result = await Api.post("/guest/recovery", { orderId: document.getElementById("guest-recovery-order").value.trim(), email: document.getElementById("guest-recovery-email").value.trim() });
      if (current()) managementAlert(result.message);
    });
  });
  document.getElementById("guest-merge").addEventListener("click", event => guestOrderTask(event.currentTarget, async current => {
    await Api.post("/guest/merge-cart", {}); if (!current()) return;
    managementAlert("Guest cart merged. Open your account cart to continue."); await loadGuestOrders(); await refreshCartBadge();
  }));
  document.getElementById("guest-claim").addEventListener("click", event => guestOrderTask(event.currentTarget, async current => {
    await Api.post("/guest/merge-cart", {}); if (!current()) return;
    const result = await Api.post("/guest/claim", { confirmed: true }); if (!current()) return;
    Guest.current = null; Guest.changed(); renderHeader("orders");
    managementAlert(result.linked + " guest orders linked. Open My account orders to continue."); await loadGuestOrders();
  }));
  await loadGuestOrders();
});
window.addEventListener("norda:guest-expired", () => loadGuestOrders());
async function loadGuestOrders() {
  const read = ++guestOrdersRead, identity = Guest.current?.id, account = guestOrderAccount(), refresh = document.getElementById("guest-orders-refresh");
  if (refresh) refresh.disabled = true;
  const current = () => read === guestOrdersRead && identity === Guest.current?.id && account === guestOrderAccount();
  document.getElementById("guest-account-actions").hidden = !Api.isLoggedIn() || !identity;
  const accountLink = document.getElementById("guest-account-link");
  if (accountLink) { accountLink.href = Api.isLoggedIn() ? "orders.html" : "login.html"; accountLink.textContent = Api.isLoggedIn() ? "My account orders" : "Sign in"; }
  document.getElementById("guest-session-root").textContent = identity ? "Private browser access is active" + (Guest.current.email ? " · " + Guest.current.email : "") + (Guest.current.expiresAt ? " · Access until " + formatDate(Guest.current.expiresAt) : "") : "No active guest access in this browser. Your store order remains saved; recover access using its Order ID and checkout email below.";
  if (!identity) {
    document.getElementById("guest-orders-root").innerHTML = '<p class="management-empty">Place a guest order or open your emailed recovery link to see its progress here.</p>';
    document.getElementById("guest-cart-root").innerHTML = '<a class="text-link" href="products.html">Start shopping</a>';
    if (refresh) refresh.disabled = false; return;
  }
  try {
    const [orders, cart] = await Promise.all([Api.get("/guest/orders"), Api.get("/guest/cart")]); if (!current()) return;
    document.getElementById("guest-orders-root").innerHTML = orders.length ? orders.map(guestOrderHtml).join("") : '<p class="management-empty">You have not placed a guest order yet.</p>';
    document.getElementById("guest-cart-root").innerHTML = cart.items.length ? cart.items.map(item => `<div class="expansion-row"><div><strong>${escapeHtml(item.product?.name || "Unavailable product")}</strong><small> × ${item.quantity} · ${money(item.price * item.quantity)}</small></div><button class="btn btn-outline btn-sm" data-remove-guest="${escapeHtml(item._id)}" type="button">Remove</button></div>`).join("") + (!Api.isLoggedIn() ? '<a class="btn btn-primary" href="cart.html">Open guest cart</a>' : '<p class="management-muted">Merge this selection into your account cart, or remove unavailable items first.</p>') : '<p class="management-muted">Your guest cart is empty.</p>';
    document.querySelectorAll("[data-remove-guest]").forEach(button => button.addEventListener("click", () => guestOrderTask(button, async active => {
      await Api.del("/guest/cart/" + button.dataset.removeGuest); if (!active()) return;
      await loadGuestOrders(); await refreshCartBadge();
    })));
  } catch (error) {
    if (current()) managementAlert(error.message, "error");
    else if (read === guestOrdersRead && !Guest.current) await loadGuestOrders();
  } finally { if (refresh && read === guestOrdersRead) refresh.disabled = false; }
}
function guestOrderHtml(order) {
  const selected = new URLSearchParams(window.location.search).get("placed"), highlighted = selected === order._id;
  return `<article class="expansion-readonly guest-order-card${highlighted ? " is-selected" : ""}"><div class="management-actions"><strong>Order #${escapeHtml(order._id.slice(-8).toUpperCase())}</strong>${managementStatus(order.status)}${managementStatus(order.paymentStatus)}</div><p class="management-muted guest-order-id">Full Order ID: <strong>${escapeHtml(order._id)}</strong><br>${escapeHtml(formatDate(order.createdAt, true))} · ${money(order.totalAmount)}</p>${orderProgressHtml(order.status)}<p class="management-muted">Store staff update each stage. Keep this Order ID and your checkout email for recovery.</p><div class="management-actions"><a class="btn btn-primary btn-sm" href="order-tracking.html?orderId=${encodeURIComponent(order._id)}&guest=1">Track delivery</a><a class="btn btn-outline btn-sm" href="invoice.html?orderId=${encodeURIComponent(order._id)}&guest=1">Invoice</a>${!Api.isLoggedIn() ? `<a class="text-link" href="order-support.html?orderId=${encodeURIComponent(order._id)}">Order requests & payments</a>` : '<span class="management-muted">To manage requests from your account, verify the same email in Profile and link these purchases above.</span>'}</div></article>`;
}

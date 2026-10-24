const nextOrderStates = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};
let ordersPage = 1, ordersRead = 0, ordersOwner, ordersWriting = false;
const ordersCurrent = () => ordersOwner === Api.getUser()?._id;

document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  if (!requireAdmin()) return;
  renderAdminShell("orders"); ordersOwner = Api.getUser()._id;
  document.getElementById("orders-refresh").addEventListener("click", loadOrders);
  const initialPayment = new URLSearchParams(window.location.search).get("paymentStatus");
  if (["pending", "paid", "failed", "cancelled", "review"].includes(initialPayment)) document.getElementById("payment-filter").value = initialPayment;
  document.getElementById("status-filter").addEventListener("change", () => { ordersPage = 1; loadOrders(); });
  document.getElementById("payment-filter").addEventListener("change", () => { ordersPage = 1; loadOrders(); });
  document.getElementById("export-orders-btn").addEventListener("click", exportOrders);
  await loadOrders();
});

async function loadOrders() {
  if (!ordersCurrent()) return;
  const read = ++ordersRead, root = document.getElementById("orders-root");
  const status = document.getElementById("status-filter").value;
  const paymentStatus = document.getElementById("payment-filter").value;
  root.innerHTML = `<span class="spinner">Loading orders…</span>`;
  try {
    const query = new URLSearchParams({ limit: "25", page: String(ordersPage) });
    if (status) query.set("status", status);
    if (paymentStatus) query.set("paymentStatus", paymentStatus);
    const data = await Api.get("/orders?" + query.toString());
    if (!ordersCurrent() || read !== ordersRead) return;
    if (!data.orders.length && ordersPage > data.pages) { ordersPage = data.pages; return loadOrders(); }
    if (!data.orders.length) {
      root.innerHTML = `<div class="empty-state"><h2>No orders found</h2><p>Try a different status filter.</p></div>`;
      return;
    }
    root.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Fulfillment</th><th>Next action</th></tr></thead><tbody>${data.orders.map(orderRow).join("")}</tbody></table></div>${adminPagination(data.page, data.pages, data.total)}`;
    root.querySelectorAll("[data-transition]").forEach((select) => select.addEventListener("change", () => updateOrder(select)));
    root.querySelectorAll("[data-cod-paid]").forEach((button) => button.addEventListener("click", () => markCodPaid(button)));
    root.querySelectorAll("[data-orders-page]").forEach((button) => button.addEventListener("click", () => { ordersPage = Number(button.dataset.ordersPage); loadOrders(); }));
  } catch (error) {
    if (!ordersCurrent() || read !== ordersRead) return;
    root.innerHTML = `<div class="empty-state"><h2>Orders unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function adminPagination(page, pages, total) {
  if (pages <= 1) return "";
  return `<nav class="admin-pagination" aria-label="Order pages"><span>Page ${page} of ${pages} · ${total} orders</span><div><button class="btn btn-outline btn-sm" data-orders-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button><button class="btn btn-outline btn-sm" data-orders-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Next</button></div></nav>`;
}

function orderRow(order) {
  const blocked = ["requested", "approved", "completed"].includes(order.cancellationStatus) || ["approved", "received", "completed"].includes(order.returnStatus) || ["pending", "unknown", "partially_refunded", "refunded"].includes(order.refundStatus);
  const next = (blocked ? [] : nextOrderStates[order.status] || []).filter(status => !order.fulfillmentManaged || status === "cancelled").filter(
    (status) => status === "cancelled" ? !order.isPaid && order.paymentStatus !== "review" : order.paymentMethod === "cod" || order.paymentStatus === "paid"
  );
  return `<tr>
    <td><strong>#${order._id.slice(-8).toUpperCase()}</strong><small>${formatDate(order.createdAt, true)}</small><a class="text-link" href="../invoice.html?orderId=${encodeURIComponent(order._id)}">Invoice</a><a class="text-link" href="operations.html?orderId=${encodeURIComponent(order._id)}">Requests & payments</a><a class="text-link" href="shipments.html?orderId=${encodeURIComponent(order._id)}">Delivery tracking</a></td>
    <td>${escapeHtml(order.customerSnapshot?.name || order.user?.name || "Customer")}<small>${escapeHtml(order.customerSnapshot?.email || order.user?.email || "")}</small><small>${escapeHtml(order.shippingAddress?.phone || "")}</small><span class="status-pill">${order.customerSnapshot?.isGuest ? "Guest checkout" : "Account order"}</span></td>
    <td><strong>${money(order.totalAmount)}</strong><small>${order.items.reduce((count, item) => count + item.quantity, 0)} item(s)</small></td>
    <td><span class="status-pill payment-${order.paymentStatus}">${escapeHtml(paymentLabel(order.paymentStatus))}</span><small>${escapeHtml(paymentMethodLabel(order))}</small>${order.paymentMethod === "cod" && !order.fulfillmentManaged && !blocked && !order.isPaid && order.status !== "cancelled" && order.paymentStatus !== "review" ? `<button class="text-link button-link" data-cod-paid="${order._id}">Record cash received</button>` : ""}</td>
    <td><span class="status-pill status-${order.status}">${escapeHtml(order.status)}</span>${order.reservationExpiredAt ? `<small>Reservation expired · Stock released</small>` : ""}${order.cancelReason ? `<small>${escapeHtml(paymentNote(order.cancelReason))}</small>` : ""}${order.paymentReviewReason ? `<small class="danger-text">${escapeHtml(order.paymentReviewReason)}</small>` : ""}</td>
    <td>${order.fulfillmentManaged && !["cancelled", "delivered"].includes(order.status) ? `<a class="text-link" href="fulfillment.html?orderId=${encodeURIComponent(order._id)}">Manage warehouse parcels →</a>` : ""}${next.length ? `<select data-transition="${order._id}" data-current="${order.status}" aria-label="Update order ${order._id}"><option value="">Choose action…</option>${next.map((status) => `<option value="${status}">${status === "cancelled" ? "Cancel & restore stock" : status === "shipped" ? "Add courier & dispatch…" : "Mark " + status}</option>`).join("")}</select>` : `<span class="muted">${blocked ? `<a class="text-link" href="operations.html?orderId=${encodeURIComponent(order._id)}">Resolve request/refund →</a>` : order.fulfillmentManaged && !["cancelled", "delivered"].includes(order.status) ? "Order follows its parcels" : "No further action"}</span>`}</td>
  </tr>`;
}

async function updateOrder(select) {
  const status = select.value;
  if (!status || ordersWriting || !ordersCurrent()) return;
  if (status === "shipped") { window.location.href = "shipments.html?orderId=" + encodeURIComponent(select.dataset.transition) + "&action=dispatch"; return; }
  let cancelReason = "";
  if (status === "cancelled") { cancelReason = prompt("Why is this order being cancelled? Stock will be restored.", "Payment was not completed") || ""; if (!cancelReason.trim()) { select.value = ""; return; } }
  ordersWriting = true; select.disabled = true;
  try {
    await Api.put(`/orders/${select.dataset.transition}/status`, { status, cancelReason });
    if (!ordersCurrent()) return;
    showTopAlert(status === "cancelled" ? "Order cancelled and stock restored." : "Order marked " + status + ".", "success"); await loadOrders();
  } catch (error) { if (ordersCurrent()) { showTopAlert(error.message, "error"); select.value = ""; } }
  finally { ordersWriting = false; if (ordersCurrent()) select.disabled = false; }
}
async function markCodPaid(button) {
  if (button.disabled || ordersWriting || !ordersCurrent() || !confirm("Confirm that cash was actually received for this order?")) return;
  const orderId = button.dataset.codPaid; ordersWriting = true; button.disabled = true;
  try {
    const order = await Api.get("/orders/" + orderId); if (!ordersCurrent()) return;
    await Api.put(`/orders/${orderId}/status`, { status: order.status, isPaid: true }); if (!ordersCurrent()) return;
    showTopAlert("Cash-on-delivery payment recorded.", "success"); await loadOrders();
  } catch (error) { if (ordersCurrent()) showTopAlert(error.message, "error"); }
  finally { ordersWriting = false; if (ordersCurrent()) button.disabled = false; }
}

async function exportOrders() {
  if (!ordersCurrent()) return;
  const query = new URLSearchParams();
  const status = document.getElementById("status-filter").value;
  const paymentStatus = document.getElementById("payment-filter").value;
  const from = document.getElementById("date-from").value;
  const to = document.getElementById("date-to").value;
  if (status) query.set("status", status);
  if (paymentStatus) query.set("paymentStatus", paymentStatus);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const button = document.getElementById("export-orders-btn");
  if (button.disabled) return; button.disabled = true;
  try { await Api.download("/admin/reports/orders.csv" + (query.toString() ? "?" + query.toString() : ""), "norda-orders.csv"); }
  catch (error) { showTopAlert(error.message, "error"); }
  finally { button.disabled = false; }
}

function showTopAlert(message, type) {
  const box = document.getElementById("alert-box");
  box.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
  setTimeout(() => { box.innerHTML = ""; }, 3500);
}

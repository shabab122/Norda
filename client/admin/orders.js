const nextOrderStates = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};
let ordersPage = 1;

document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  if (!requireAdmin()) return;
  renderAdminShell("orders");
  const initialPayment = new URLSearchParams(window.location.search).get("paymentStatus");
  if (["pending", "paid", "failed", "cancelled", "review"].includes(initialPayment)) document.getElementById("payment-filter").value = initialPayment;
  document.getElementById("status-filter").addEventListener("change", () => { ordersPage = 1; loadOrders(); });
  document.getElementById("payment-filter").addEventListener("change", () => { ordersPage = 1; loadOrders(); });
  document.getElementById("export-orders-btn").addEventListener("click", exportOrders);
  await loadOrders();
});

async function loadOrders() {
  const root = document.getElementById("orders-root");
  const status = document.getElementById("status-filter").value;
  const paymentStatus = document.getElementById("payment-filter").value;
  root.innerHTML = `<span class="spinner">Loading orders…</span>`;
  try {
    const query = new URLSearchParams({ limit: "25", page: String(ordersPage) });
    if (status) query.set("status", status);
    if (paymentStatus) query.set("paymentStatus", paymentStatus);
    const data = await Api.get("/orders?" + query.toString());
    if (!data.orders.length) {
      root.innerHTML = `<div class="empty-state"><h2>No orders found</h2><p>Try a different status filter.</p></div>`;
      return;
    }
    root.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Fulfillment</th><th>Next action</th></tr></thead><tbody>${data.orders.map(orderRow).join("")}</tbody></table></div>${adminPagination(data.page, data.pages, data.total)}`;
    root.querySelectorAll("[data-transition]").forEach((select) => select.addEventListener("change", () => updateOrder(select)));
    root.querySelectorAll("[data-cod-paid]").forEach((button) => button.addEventListener("click", () => markCodPaid(button.dataset.codPaid)));
    root.querySelectorAll("[data-orders-page]").forEach((button) => button.addEventListener("click", () => { ordersPage = Number(button.dataset.ordersPage); loadOrders(); }));
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><h2>Orders unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function adminPagination(page, pages, total) {
  if (pages <= 1) return "";
  return `<nav class="admin-pagination" aria-label="Order pages"><span>Page ${page} of ${pages} · ${total} orders</span><div><button class="btn btn-outline btn-sm" data-orders-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button><button class="btn btn-outline btn-sm" data-orders-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Next</button></div></nav>`;
}

function orderRow(order) {
  const next = (nextOrderStates[order.status] || []).filter(
    (status) => status === "cancelled" ? !order.isPaid && order.paymentStatus !== "review" : order.paymentMethod === "cod" || order.paymentStatus === "paid"
  );
  return `<tr>
    <td><strong>#${order._id.slice(-8).toUpperCase()}</strong><small>${formatDate(order.createdAt, true)}</small><a class="text-link" href="../invoice.html?orderId=${encodeURIComponent(order._id)}">Invoice</a></td>
    <td>${escapeHtml(order.user?.name || "Deleted user")}<small>${escapeHtml(order.user?.email || "")}</small></td>
    <td><strong>${money(order.totalAmount)}</strong><small>${order.items.reduce((count, item) => count + item.quantity, 0)} item(s)</small></td>
    <td><span class="status-pill payment-${order.paymentStatus}">${escapeHtml(paymentLabel(order.paymentStatus))}</span><small>${escapeHtml(paymentMethodLabel(order))}</small>${order.paymentMethod === "cod" && !order.isPaid && order.status !== "cancelled" && order.paymentStatus !== "review" ? `<button class="text-link button-link" data-cod-paid="${order._id}">Mark COD paid</button>` : ""}</td>
    <td><span class="status-pill status-${order.status}">${escapeHtml(order.status)}</span>${order.reservationExpiredAt ? `<small>Reservation expired · Stock released</small>` : ""}${order.cancelReason ? `<small>${escapeHtml(paymentNote(order.cancelReason))}</small>` : ""}${order.paymentReviewReason ? `<small class="danger-text">${escapeHtml(order.paymentReviewReason)}</small>` : ""}</td>
    <td>${next.length ? `<select data-transition="${order._id}" data-current="${order.status}" aria-label="Update order ${order._id}"><option value="">Choose action…</option>${next.map((status) => `<option value="${status}">${status === "cancelled" ? "Cancel & restore stock" : "Mark " + status}</option>`).join("")}</select>` : `<span class="muted">No further action</span>`}</td>
  </tr>`;
}

async function updateOrder(select) {
  const status = select.value;
  if (!status) return;
  let cancelReason = "";
  if (status === "cancelled") {
    cancelReason = prompt("Why is this order being cancelled? Stock will be restored.", "Payment was not completed") || "";
    if (!cancelReason) { select.value = ""; return; }
  }
  select.disabled = true;
  try {
    await Api.put(`/orders/${select.dataset.transition}/status`, { status, cancelReason });
    showTopAlert(status === "cancelled" ? "Order cancelled and stock restored." : "Order marked " + status + ".", "success");
    await loadOrders();
  } catch (error) {
    showTopAlert(error.message, "error");
    select.disabled = false;
    select.value = "";
  }
}

async function markCodPaid(orderId) {
  if (!confirm("Confirm that cash was received for this order?")) return;
  try {
    const order = await Api.get("/orders/" + orderId);
    await Api.put(`/orders/${orderId}/status`, { status: order.status, isPaid: true });
    showTopAlert("Cash-on-delivery payment recorded.", "success");
    await loadOrders();
  } catch (error) { showTopAlert(error.message, "error"); }
}

async function exportOrders() {
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
  button.disabled = true;
  try { await Api.download("/admin/reports/orders.csv" + (query.toString() ? "?" + query.toString() : ""), "norda-orders.csv"); }
  catch (error) { showTopAlert(error.message, "error"); }
  finally { button.disabled = false; }
}

function showTopAlert(message, type) {
  const box = document.getElementById("alert-box");
  box.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
  setTimeout(() => { box.innerHTML = ""; }, 3500);
}

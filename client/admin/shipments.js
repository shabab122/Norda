let shipmentPage = 1, shipmentRead = 0, shipmentQueueRead = 0, shipmentWrite = false;
const shipmentOrderId = new URLSearchParams(window.location.search).get("orderId") || "";
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; if (!requireAdmin()) return; renderAdminShell("shipments");
  document.getElementById("shipment-status-filter").addEventListener("change", () => { shipmentPage = 1; loadShipmentOrders(); });
  await loadShipmentOrders();
  if (/^[a-f0-9]{24}$/i.test(shipmentOrderId)) await loadShipmentDetail();
});
async function loadShipmentOrders() {
  const account = Api.getUser()?._id, sequence = ++shipmentQueueRead, root = document.getElementById("shipment-orders");
  try {
    const data = await Api.get("/orders?" + new URLSearchParams({ status: document.getElementById("shipment-status-filter").value, page: shipmentPage, limit: 10 }));
    if (account !== Api.getUser()?._id || sequence !== shipmentQueueRead) return;
    if (!data.orders.length && shipmentPage > data.pages) { shipmentPage = data.pages; return loadShipmentOrders(); }
    root.innerHTML = `<div class="shipment-queue">${data.orders.map((order) => `<a href="shipments.html?orderId=${encodeURIComponent(order._id)}"><strong>#${escapeHtml(order._id.slice(-8).toUpperCase())} · ${escapeHtml(order.user?.name || "Customer")}</strong><span>${escapeHtml(order.shipment?.courierName || order.status)} · ${money(order.totalAmount)}</span></a>`).join("") || '<p>No orders in this state.</p>'}</div>${data.pages > 1 ? `<nav class="operations-pagination" aria-label="Shipment order pages"><button class="btn btn-outline btn-sm" type="button" data-shipment-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Previous</button><span>${data.page} / ${data.pages}</span><button class="btn btn-outline btn-sm" type="button" data-shipment-page="${data.page + 1}" ${data.page >= data.pages ? "disabled" : ""}>Next</button></nav>` : ""}`;
    root.querySelectorAll("[data-shipment-page]").forEach((button) => button.addEventListener("click", () => { shipmentPage = Number(button.dataset.shipmentPage); loadShipmentOrders(); }));
  } catch (error) { if (account === Api.getUser()?._id && sequence === shipmentQueueRead) root.textContent = error.message; }
}
async function loadShipmentDetail() {
  const account = Api.getUser()?._id, sequence = ++shipmentRead, root = document.getElementById("shipment-detail");
  try {
    const data = await Api.get("/orders/" + shipmentOrderId + "/tracking?limit=100");
    if (account !== Api.getUser()?._id || sequence !== shipmentRead) return;
    const storageKey = "norda-shipment:" + account + ":" + shipmentOrderId;
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null"); if (saved && data.events.some((e) => e.requestKey === saved.key)) sessionStorage.removeItem(storageKey); } catch { /* Retain safe server replay. */ }
    root.hidden = false; root.innerHTML = shipmentDetailHtml(data);
    root.querySelector("[data-shipment-refresh]").addEventListener("click", loadShipmentDetail);
    const form = root.querySelector("#shipment-form");
    if (form) {
      form.addEventListener("submit", saveShipment);
      const required = () => { const dispatch = form.elements.event.value === "shipped"; form.elements.courierName.required = dispatch; form.elements.trackingNumber.required = dispatch; };
      form.elements.event.addEventListener("change", required); required();
    }
  } catch (error) { if (account === Api.getUser()?._id && sequence === shipmentRead) { root.hidden = false; root.innerHTML = `<div class="operations-card"><p>${escapeHtml(error.message)}</p></div>`; } }
}
function shipmentDetailHtml(data) {
  const { order, shipment, events } = data, closed = ["cancelled", "delivered"].includes(order.status) || order.fulfillmentManaged;
  const choices = [["details_updated", "Save courier details"], ...(order.status === "processing" ? [["shipped", "Dispatch order"]] : []), ...(order.status === "shipped" ? [["in_transit", "In transit"], ["out_for_delivery", "Out for delivery"], ["delivery_attempted", "Delivery attempted"], ["delivered", "Delivered"]] : [])];
  return `<div class="operations-card"><span class="eyebrow">Order #${escapeHtml(order._id.slice(-8).toUpperCase())}</span><h2>${escapeHtml(order.status)}${shipment.state ? " · " + escapeHtml(shipment.state.replace(/_/g, " ")) : ""}</h2><div class="operations-actions"><a class="text-link" href="orders.html">Order processing</a><a class="text-link" href="../order-tracking.html?orderId=${encodeURIComponent(order._id)}">Customer tracking view</a><a class="text-link" href="notifications.html?orderId=${encodeURIComponent(order._id)}">Order emails</a><button class="btn btn-outline btn-sm" type="button" data-shipment-refresh>Refresh shipment</button></div></div><div class="operations-grid"><section class="operations-card"><h2>Courier & delivery update</h2>${closed ? order.fulfillmentManaged && !['cancelled','delivered'].includes(order.status) ? `<p>Update each warehouse parcel; the order follows all parcel deliveries.</p><a class="text-link" href="fulfillment.html?orderId=${encodeURIComponent(order._id)}">Manage warehouse parcels →</a>` : '<p>Shipment updates are closed for this order. Existing history remains below.</p>' : `<form id="shipment-form"><div class="shipment-form-grid">${[["courierName", "Courier name", shipment.courierName || "", 80], ["trackingNumber", "Tracking number", shipment.trackingNumber || "", 100]].map(([name, label, value, max]) => `<label for="shipment-${name}">${label}<input id="shipment-${name}" name="${name}" value="${escapeHtml(value)}" maxlength="${max}" /></label>`).join("")}<label class="full" for="shipment-url">Courier tracking URL (optional, HTTPS)<input type="url" name="trackingUrl" id="shipment-url" value="${escapeHtml(shipment.trackingUrl || "")}" maxlength="500" placeholder="https://courier.example/track/…" /></label><label for="shipment-event">Update<select name="event" id="shipment-event">${choices.map(([value, label]) => `<option value="${value}" ${value === "shipped" && new URLSearchParams(window.location.search).get("action") === "dispatch" ? "selected" : ""}>${label}</option>`).join("")}</select></label><label for="shipment-location">Location (optional)<input id="shipment-location" name="location" maxlength="120" /></label><label class="full" for="shipment-note">Customer-visible update (optional)<textarea id="shipment-note" name="note" maxlength="500" rows="3"></textarea></label></div><p>Courier updates appear in the customer's tracking view. Dispatch follows normal fulfillment/payment checks. Delivery records COD as paid.</p><div class="operations-actions"><button class="btn btn-primary" type="submit">Save shipment update</button></div></form>`}</section><section class="operations-card"><h2>Shipment history</h2>${events.length ? `<ol class="shipment-timeline">${events.map((e) => `<li><strong>${escapeHtml(e.event.replace(/_/g, " "))}</strong><time>${escapeHtml(formatDate(e.createdAt, true))}</time><p>${escapeHtml(e.note || "")}</p><small>${escapeHtml([e.courierName, e.trackingNumber, e.location].filter(Boolean).join(" · "))}</small></li>`).join("")}</ol>` : '<p>No shipment events have been recorded.</p>'}${data.total > events.length ? `<p>Showing the latest ${events.length} of ${data.total} events. The customer tracking view has paginated history.</p>` : ""}</section></div>`;
}
async function saveShipment(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (shipmentWrite || !form.reportValidity() || !(Api.isAdmin() || Api.can?.("orders"))) return;
  const account = Api.getUser()?._id, storageKey = "norda-shipment:" + account + ":" + shipmentOrderId, alert = document.getElementById("shipment-alert");
  const body = Object.fromEntries(["courierName", "trackingNumber", "trackingUrl", "event", "location", "note"].map((key) => [key, form.elements[key].value.trim()]));
  const signature = JSON.stringify(body), button = form.querySelector('[type="submit"]');
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (saved && saved.signature !== signature) throw new Error("The previous update is still uncertain. Refresh the shipment or retry those same details before making another change.");
    body.requestKey = saved?.key || crypto.randomUUID(); sessionStorage.setItem(storageKey, JSON.stringify({ key: body.requestKey, signature }));
    shipmentWrite = true; button.disabled = true;
    await Api.post("/orders/" + shipmentOrderId + "/shipment", body);
    if (account !== Api.getUser()?._id) return;
    sessionStorage.removeItem(storageKey); alert.textContent = "Shipment saved. Order emails will be delivered from the queue."; await loadShipmentDetail(); await loadShipmentOrders();
  } catch (error) { if (account === Api.getUser()?._id) { if (error.status >= 400 && error.status < 500) sessionStorage.removeItem(storageKey); alert.textContent = error.message; } }
  finally { shipmentWrite = false; button.disabled = false; }
}

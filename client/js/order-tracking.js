let trackingPage = 1, trackingSequence = 0;
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; renderHeader("orders"); renderFooter(); if (!requireShopper()) return;
  await loadTracking();
});
function safeCourierLink(value) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}
async function loadTracking() {
  const root = document.getElementById("tracking-root"), account = shoppingIdentity(), sequence = ++trackingSequence;
  const id = new URLSearchParams(window.location.search).get("orderId");
  try {
    if (!/^[a-f0-9]{24}$/i.test(id || "")) throw new Error("Choose an order from My Orders to view its delivery.");
    const data = await Api.get("/orders/" + id + "/tracking?page=" + trackingPage);
    if (account !== shoppingIdentity() || sequence !== trackingSequence) return;
    root.innerHTML = trackingHtml(data);
    root.querySelector("[data-tracking-refresh]").addEventListener("click", () => loadTracking());
    root.querySelectorAll("[data-tracking-page]").forEach((button) => button.addEventListener("click", () => { trackingPage = Number(button.dataset.trackingPage); loadTracking(); }));
    await loadCarrierState(account, id, sequence);
    if (data.order.fulfillmentManaged) await loadTrackingParcels(account, id, sequence);
  } catch (error) { if (account === shoppingIdentity() && sequence === trackingSequence) root.innerHTML = `<div class="operations-card"><h2>Delivery details unavailable</h2><p>${escapeHtml(error.message)}</p><a href="${orderHistoryUrl()}" class="btn btn-outline">My orders</a></div>`; }
  finally { if (sequence === trackingSequence) root.setAttribute("aria-busy", "false"); }
}
function trackingHtml(data) {
  const { order, shipment, events } = data, link = safeCourierLink(shipment.trackingUrl);
  const state = (shipment.state || order.status).replace(/_/g, " ");
  return `<div class="operations-grid"><section class="operations-card"><span class="eyebrow">Order #${escapeHtml(order._id.slice(-8).toUpperCase())}</span>${orderProgressHtml(order.status)}<div class="shipment-summary"><h2>${escapeHtml(state)}</h2><p>${order.status === "cancelled" ? "This order is cancelled. Any repayment is tracked separately in order support." : shipment.state ? "Check the latest update below, or open the courier's tracking page when a link is available." : "The store will add courier details when your order is prepared for dispatch."}</p></div><dl><div><dt>Courier</dt><dd>${escapeHtml(shipment.courierName || "Not assigned yet")}</dd></div><div><dt>Tracking number</dt><dd>${escapeHtml(shipment.trackingNumber || "Not assigned yet")}</dd></div></dl><div class="operations-actions">${link ? `<a class="btn btn-primary" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Open courier tracking ↗</a>` : ""}<button class="btn btn-outline" type="button" data-tracking-refresh>Refresh delivery</button>${isGuestOrderView() && Api.isLoggedIn() ? '<a class="text-link" href="guest-orders.html">Guest access & account linking</a>' : `<a class="text-link" href="order-support.html?orderId=${encodeURIComponent(order._id)}">Order support</a>`}<a class="text-link" href="invoice.html?orderId=${encodeURIComponent(order._id)}${isGuestOrderView() ? '&guest=1' : ''}">Invoice</a><a class="text-link" href="${orderHistoryUrl()}">Back to orders</a></div></section><section class="operations-card"><h2>Shipment history</h2>${events.length ? `<ol class="shipment-timeline">${events.map((event) => `<li><strong>${escapeHtml(event.event.replace(/_/g, " "))}</strong><time datetime="${escapeHtml(event.createdAt)}">${escapeHtml(formatDate(event.createdAt, true))}</time>${event.location ? `<small>${escapeHtml(event.location)}</small>` : ""}${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}${event.courierName ? `<small>${escapeHtml(event.courierName)}${event.trackingNumber ? " · " + escapeHtml(event.trackingNumber) : ""}</small>` : ""}</li>`).join("")}</ol>` : '<p>No shipment updates yet.</p>'}${data.pages > 1 ? `<nav class="operations-pagination" aria-label="Shipment history pages"><button class="btn btn-outline btn-sm" type="button" data-tracking-page="${data.page - 1}" ${data.page === 1 ? "disabled" : ""}>Newer</button><span>${data.page} / ${data.pages}</span><button class="btn btn-outline btn-sm" type="button" data-tracking-page="${data.page + 1}" ${data.page >= data.pages ? "disabled" : ""}>Older</button></nav>` : ""}</section></div>`;
}

async function loadCarrierState(owner, id, sequence) {
  try { const data = await Api.get("/orders/" + id + "/courier"); if (owner !== shoppingIdentity() || sequence !== trackingSequence || !data.booking) return; const section = document.createElement("section"); section.className = "operations-card"; const b = data.booking; section.innerHTML = `<h2>Carrier updates</h2><p>${escapeHtml(b.providerStatus || b.status)} · ${escapeHtml(b.trackingNumber || "Awaiting carrier reference")}</p>${b.exceptionStatus === "open" ? `<p><strong>Delivery exception:</strong> ${escapeHtml(b.exceptionReason)}</p>` : ""}${b.resolutionNote ? `<p>Store update: ${escapeHtml(b.resolutionNote)}</p>` : ""}<p>Contact customer care if an exception needs your attention. Your original order and refund history remain available.</p>`; document.getElementById("tracking-root").appendChild(section); } catch { /* Store-entered tracking remains available. */ }
}

async function loadTrackingParcels(owner, id, sequence) {
  try {
    const parcels = await Api.get("/orders/" + id + "/parcels");
    if (owner !== shoppingIdentity() || sequence !== trackingSequence || !Array.isArray(parcels) || !parcels.length) return;
    const section = document.createElement("section"); section.className = "operations-card";
    section.innerHTML = '<h2>Your delivery parcels</h2><p>This order may arrive in separate parcels. The order is delivered after every parcel arrives.</p>' + parcels.map(parcel => {
      const link = safeCourierLink(parcel.trackingUrl);
      return `<article class="operations-history"><h3>${escapeHtml(parcel.warehouseName || "Fulfillment parcel")}</h3>${orderProgressHtml(parcel.status)}<p>${(parcel.items || []).map(item => escapeHtml(item.name) + " × " + item.quantity).join(" · ")}</p><p>${escapeHtml(parcel.courierName || "Courier not assigned")}${parcel.trackingNumber ? " · " + escapeHtml(parcel.trackingNumber) : ""}</p>${link ? `<a class="text-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Track this parcel ↗</a>` : ""}</article>`;
    }).join("");
    document.getElementById("tracking-root").appendChild(section);
  } catch { /* Existing order-level history remains available. */ }
}

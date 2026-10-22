let notificationPage = 1, notificationSequence = 0;
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; if (!requireAdmin()) return; renderAdminShell("notifications");
  document.getElementById("notification-status").addEventListener("change", () => { notificationPage = 1; loadNotifications(); });
  document.getElementById("notification-refresh").addEventListener("click", loadNotifications);
  await loadNotifications();
});
async function loadNotifications() {
  const account = Api.getUser()?._id, sequence = ++notificationSequence, root = document.getElementById("notification-list");
  const query = new URLSearchParams({ page: notificationPage, status: document.getElementById("notification-status").value });
  const orderId = new URLSearchParams(window.location.search).get("orderId"); if (/^[a-f0-9]{24}$/i.test(orderId || "")) query.set("orderId", orderId);
  try {
    const data = await Api.get("/admin/notifications?" + query);
    if (account !== Api.getUser()?._id || sequence !== notificationSequence) return;
    if (!data.items.length && notificationPage > data.pages) { notificationPage = data.pages; return loadNotifications(); }
    document.getElementById("notification-config").textContent = data.transport === "smtp" ? "SMTP delivery is configured. Sent means the email server accepted the message; inbox placement depends on the recipient's provider." : data.transport === "file" ? "Development email preview is active. Order emails are saved privately on the server; inbox delivery uses your existing SMTP configuration." : "Email configuration needs attention. Messages stay in the queue while you check your SMTP settings.";
    root.innerHTML = notificationListHtml(data);
    root.querySelectorAll("[data-email-page]").forEach((button) => button.addEventListener("click", () => { notificationPage = Number(button.dataset.emailPage); loadNotifications(); }));
    root.querySelectorAll("[data-retry-email]").forEach((button) => button.addEventListener("click", async () => {
      if (button.disabled || account !== Api.getUser()?._id || !(Api.isAdmin() || Api.can?.("notifications"))) return; button.disabled = true;
      try { await Api.post("/admin/notifications/" + button.dataset.retryEmail + "/retry", {}); if (account === Api.getUser()?._id) await loadNotifications(); }
      catch (error) { if (account === Api.getUser()?._id) { document.getElementById("notification-alert").textContent = error.message; button.disabled = false; } }
    }));
  } catch (error) { if (account === Api.getUser()?._id && sequence === notificationSequence) root.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}
function notificationListHtml(data) {
  return `<p>${data.total} email(s) · Page ${data.page} of ${data.pages}</p>${data.items.length ? `<div class="table-wrap"><table class="data-table notification-table"><thead><tr><th>Order / email</th><th>Recipient</th><th>Status</th><th>Delivery</th></tr></thead><tbody>${data.items.map((item) => `<tr><td><a class="text-link" href="shipments.html?orderId=${encodeURIComponent(item.order)}">#${escapeHtml(String(item.order).slice(-8).toUpperCase())}</a><small>${escapeHtml(item.subject)}</small></td><td class="notification-address">${escapeHtml(item.to)}</td><td><span class="operations-badge">${escapeHtml(item.status === "sent" && item.transport === "file" ? "Saved preview" : item.status)}</span><small>${Number(item.attempts || 0)} attempt(s)</small>${item.lastError ? `<small>${escapeHtml(item.lastError)}</small>` : ""}</td><td>${item.sentAt ? escapeHtml(formatDate(item.sentAt, true)) : item.nextAttemptAt ? "Next check: " + escapeHtml(formatDate(item.nextAttemptAt, true)) : "Waiting"}<small>Provider: ${escapeHtml(item.deliveryStatus || "unknown")}${item.deliveryReason ? " · " + escapeHtml(item.deliveryReason) : ""}</small><button class="btn btn-outline btn-sm" type="button" data-email-events="${escapeHtml(item._id)}">Delivery history</button>${item.messageId && item.transport !== "file" ? `<button class="btn btn-outline btn-sm" type="button" data-email-outcome="${escapeHtml(item._id)}">Record provider outcome</button>` : ""}${item.status === "failed" ? `<button class="btn btn-outline btn-sm" type="button" data-retry-email="${escapeHtml(item._id)}">Retry email</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="operations-empty">No order emails match this filter.</p>'}${data.pages > 1 ? `<nav class="operations-pagination" aria-label="Email pages"><button class="btn btn-outline btn-sm" type="button" data-email-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Previous</button><button class="btn btn-outline btn-sm" type="button" data-email-page="${data.page + 1}" ${data.page >= data.pages ? "disabled" : ""}>Next</button></nav>` : ""}`;
}

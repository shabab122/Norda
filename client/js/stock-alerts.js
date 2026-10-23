let stockAlertOwner, stockAlertToken, stockAlertId, stockAlertRead = 0;
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; renderHeader(); renderFooter();
  const link = window.location.hash.slice(1).split(":");
  if (link.length === 2) { [stockAlertId, stockAlertToken] = link; history.replaceState(null, "", window.location.pathname); document.getElementById("stock-unsubscribe-card").hidden = false; }
  document.getElementById("stock-unsubscribe").addEventListener("click", async e => { e.currentTarget.disabled = true; try { await Api.post("/stock-alerts/unsubscribe", { id: stockAlertId, token: stockAlertToken }); stockAlertToken = ""; managementAlert("Availability alert stopped."); document.getElementById("stock-unsubscribe-card").hidden = true; if (Api.isLoggedIn()) await loadStockAlerts(); } catch (err) { managementAlert(err.message, "error"); e.currentTarget.disabled = false; } });
  document.getElementById("stock-alert-refresh").addEventListener("click", loadStockAlerts);
  if (!Api.isLoggedIn()) { document.getElementById("stock-alerts-root").innerHTML = '<a class="btn btn-outline" href="login.html?next=stock-alerts.html">Sign in to view your alerts</a>'; return; }
  stockAlertOwner = Api.getUser()._id; await loadStockAlerts();
});
async function loadStockAlerts() {
  if (!Api.isLoggedIn()) return; stockAlertOwner ||= Api.getUser()._id; const read = ++stockAlertRead;
  try { const rows = await Api.get("/stock-alerts"); if (read !== stockAlertRead || stockAlertOwner !== Api.getUser()?._id) return; const root = document.getElementById("stock-alerts-root"); root.innerHTML = rows.length ? rows.map(w => `<article class="expansion-row"><div><a class="text-link" href="product-detail.html?id=${encodeURIComponent(w.product?._id || "")}">${escapeHtml(w.product?.name || "Archived product")}</a><small>${w.variantKey === "base" ? "Standard option" : "Option " + escapeHtml(w.variantKey.slice(-8))} · ${w.active ? "Waiting for stock" : w.fulfilledAt ? "Alert completed" : "Stopped"} · ${escapeHtml(w.deliveryStatus)}</small></div>${w.active ? `<button class="btn btn-outline btn-sm" type="button" data-stop-stock="${escapeHtml(w._id)}">Stop alert</button>` : ""}</article>`).join("") : '<p class="management-empty">You are not following any sold-out products yet.</p>'; root.querySelectorAll("[data-stop-stock]").forEach(b => b.addEventListener("click", async () => { b.disabled = true; try { await Api.del("/stock-alerts/" + b.dataset.stopStock); await loadStockAlerts(); } catch (e) { managementAlert(e.message, "error"); b.disabled = false; } })); } catch (e) { managementAlert(e.message, "error"); }
}

let settlementOwner, settlementRead = 0, settlementHash, settlementBusy = false;
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; if (!requireAdmin()) return; renderAdminShell("settlements"); settlementOwner = Api.getUser()._id;
  const invalidate = () => { settlementHash = null; document.getElementById("settlement-apply").disabled = true; };
  document.getElementById("settlement-csv").addEventListener("input", invalidate);
  document.getElementById("settlement-name").addEventListener("input", invalidate);
  document.getElementById("settlement-file").addEventListener("change", async e => { const file = e.target.files[0]; if (!file) return; if (file.size > 500000) return managementAlert("Use a CSV under 500 KB.", "error"); document.getElementById("settlement-csv").value = await file.text(); invalidate(); });
  document.getElementById("settlement-template").addEventListener("click", () => Api.download("/admin/settlements/template.csv", "norda-settlements.csv").catch(e => managementAlert(e.message, "error")));
  document.getElementById("settlement-export").addEventListener("click", () => Api.download("/admin/settlements/export.csv", "norda-settlement-ledger.csv").catch(e => managementAlert(e.message, "error")));
  document.getElementById("settlement-preview").addEventListener("click", previewSettlement);
  document.getElementById("settlement-apply").addEventListener("click", importSettlement);
  document.getElementById("settlement-refresh").addEventListener("click", () => loadSettlements());
  document.getElementById("settlement-filter").addEventListener("submit", e => { e.preventDefault(); loadSettlements(); }); await loadSettlements();
});
function settlementTable(rows, preview = false) { return managementTable(["Reference / kind", "Order", "Gross", "Fee", "Net", "Result"], rows.map(e => [`${escapeHtml(e.provider)} · ${escapeHtml(e.reference)}<small>${escapeHtml(e.kind)}</small>`, `<a class="text-link" href="operations.html?orderId=${encodeURIComponent(e.order)}">${escapeHtml(String(e.order).slice(-8).toUpperCase())}</a>`, money(e.gross), money(e.fee), money(e.net), `${managementStatus(e.status)}<small>${escapeHtml(e.reason || "")}</small>${!preview && !["matched", "excluded"].includes(e.status) ? `<form data-settlement-resolve="${escapeHtml(e._id)}"><label class="sr-only" for="resolve-status-${e._id}">Resolution</label><select id="resolve-status-${e._id}" name="status"><option value="accepted_adjustment">Accept documented adjustment</option><option value="excluded">Exclude statement line</option></select><label class="sr-only" for="resolve-note-${e._id}">Supporting note</label><input id="resolve-note-${e._id}" name="note" required minlength="5" maxlength="1000" placeholder="Reason and supporting reference" /><button class="btn btn-outline btn-sm">Record resolution</button></form>` : ""}`])); }
async function loadSettlements(page = 1) {
  const read = ++settlementRead;
  try {
    const d = await Api.get("/admin/settlements?" + new URLSearchParams({ page, status: document.getElementById("settlement-status").value })); if (read !== settlementRead || settlementOwner !== Api.getUser()?._id) return;
    document.getElementById("settlement-stats").innerHTML = Object.entries(d.totals).map(([k, v]) => `<div class="management-stat"><span>${escapeHtml(k)}</span><strong>${money(v)}</strong></div>`).join("");
    document.getElementById("settlement-outstanding").innerHTML = d.outstanding.length ? managementTable(["Order", "Method", "Expected", "Reconciled", "Remaining"], d.outstanding.map(o => [escapeHtml(String(o.orderId).slice(-8).toUpperCase()), escapeHtml(o.method), money(o.expected), money(o.settled), money(o.remaining)])) : '<p class="management-empty">No outstanding balances in this view.</p>';
    const root = document.getElementById("settlement-entries"); root.innerHTML = d.entries.length ? settlementTable(d.entries) : '<p class="management-empty">Import a statement to start reconciliation.</p>'; managementPager(root, d, loadSettlements);
    root.querySelectorAll("[data-settlement-resolve]").forEach(f => f.addEventListener("submit", async e => { e.preventDefault(); if (settlementBusy) return; settlementBusy = true; try { await Api.post("/admin/settlements/" + f.dataset.settlementResolve + "/resolve", Object.fromEntries(new FormData(f))); await loadSettlements(page); managementAlert("Resolution recorded. Order payment state was kept intact."); } catch (err) { managementAlert(err.message, "error"); } finally { settlementBusy = false; } }));
    document.getElementById("settlement-history").innerHTML = managementTable(["Statement", "Rows", "Matched", "Exceptions", "Imported"], d.batches.map(b => [escapeHtml(b.sourceName), b.rows, b.matched, b.exceptions, escapeHtml(formatDate(b.createdAt, true))]));
  } catch (e) { if (settlementOwner === Api.getUser()?._id) managementAlert(e.message, "error"); }
}
async function previewSettlement() {
  const csv = document.getElementById("settlement-csv").value, name = document.getElementById("settlement-name").value; settlementHash = null; document.getElementById("settlement-apply").disabled = true;
  try { const d = await Api.post("/admin/settlements/preview", { csv }); if (settlementOwner !== Api.getUser()?._id || csv !== document.getElementById("settlement-csv").value || name !== document.getElementById("settlement-name").value) return; settlementHash = d.sourceHash; document.getElementById("settlement-preview-root").innerHTML = `<p>${d.matched} matched · ${d.exceptions} exceptions to review</p>` + settlementTable(d.entries, true); document.getElementById("settlement-apply").disabled = false; } catch (e) { managementAlert(e.message, "error"); }
}
async function importSettlement() {
  if (!settlementHash || settlementBusy || settlementOwner !== Api.getUser()?._id) return; settlementBusy = true; const button = document.getElementById("settlement-apply"); button.disabled = true;
  const body = { csv: document.getElementById("settlement-csv").value, sourceHash: settlementHash, sourceName: document.getElementById("settlement-name").value.trim() }; body.requestKey = managementKey("settlement-import", body);
  try { await Api.post("/admin/settlements/import", body); settlementHash = null; document.getElementById("settlement-preview-root").innerHTML = ""; managementAlert("Statement imported. Review any unmatched lines below."); await loadSettlements(); } catch (e) { managementAlert(e.message, "error"); button.disabled = false; } finally { settlementBusy = false; }
}

let inventoryOwner, inventoryPage = 1, inventoryRead = 0, inventoryCsv = "", inventoryPreview, inventoryBusy = false;
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; if (!requireAdmin()) return; inventoryOwner = Api.getUser()._id; renderAdminShell("inventory");
  document.getElementById("tools-root").innerHTML = `<section class="admin-panel"><div class="panel-heading"><div><h2>Stock by product & SKU</h2><p id="inventory-count" class="tools-muted"></p></div><button class="btn btn-outline btn-sm" id="inventory-export">Export matching CSV</button></div><form class="tools-filter" id="inventory-search"><div class="field"><label for="inventory-keyword">Product name or SKU</label><input type="search" id="inventory-keyword" maxlength="80" placeholder="Find inventory" /></div><label class="check-label"><input type="checkbox" id="inventory-low" /> Low stock only</label><button class="btn btn-primary btn-sm">Apply filters</button></form><div id="inventory-list"></div></section><section class="admin-panel admin-section-gap"><h2>Import stock changes</h2><p>Export a fresh CSV, edit only <strong>stock</strong> and <strong>lowStockThreshold</strong>, then preview it here. Keep identifiers, expectedStock, inventoryVersion and the header unchanged. Up to 500 rows / 700 KB.</p><div class="field"><label for="inventory-file">Inventory CSV</label><input type="file" id="inventory-file" accept=".csv,text/csv" /></div><div class="tool-actions"><button class="btn btn-outline" id="inventory-preview" disabled>Preview changes</button><button class="btn btn-primary" id="inventory-apply" disabled>Apply reviewed changes</button></div><p class="tools-muted">Each product updates together with its SKU rows. If stock changes while importing, affected products stay unchanged; successful updates are listed separately. An interrupted update is checked before it can be repeated.</p><div id="inventory-import-result" role="status" aria-live="polite"></div></section>`;
  document.getElementById("inventory-search").addEventListener("submit", (event) => { event.preventDefault(); inventoryPage = 1; loadInventory(); });
  document.getElementById("inventory-export").addEventListener("click", exportStock);
  document.getElementById("inventory-file").addEventListener("change", readInventoryFile);
  document.getElementById("inventory-preview").addEventListener("click", previewStock);
  document.getElementById("inventory-apply").addEventListener("click", applyStock);
  document.getElementById("inventory-low").checked = new URLSearchParams(location.search).get("low") === "true";
  await loadInventory();
});
function inventoryQuery() { const q = new URLSearchParams({ page: inventoryPage, limit: 25 }); const keyword = document.getElementById("inventory-keyword").value.trim(); if (keyword) q.set("keyword", keyword); if (document.getElementById("inventory-low").checked) q.set("low", "true"); return q.toString(); }
function inventoryAlert(message, type = "success") { document.getElementById("tools-alert").innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`; }
async function loadInventory() {
  const read = ++inventoryRead;
  try {
    const data = await Api.get("/admin/inventory?" + inventoryQuery()); if (read !== inventoryRead || Api.getUser()?._id !== inventoryOwner) return;
    if (inventoryPage > data.pages) { inventoryPage = data.pages; return loadInventory(); }
    document.getElementById("inventory-count").textContent = data.lowStockCount + " low-stock options among " + data.totalOptions + " matching options";
    document.getElementById("inventory-list").innerHTML = data.items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Product / option</th><th>SKU</th><th>Stock</th><th>Alert at</th><th>Availability</th></tr></thead><tbody>${data.items.map((r) => `<tr><td><strong>${escapeHtml(r.productName)}</strong><small>${escapeHtml([r.size, r.color].filter(Boolean).join(" / "))}</small></td><td>${escapeHtml(r.sku || "Simple product")}</td><td><strong>${r.stock}</strong>${r.lowStock ? ` <span class="stock-low-pill ${r.stock === 0 ? "stock-out-pill" : ""}">${r.stock === 0 ? "Sold out" : "Running low"}</span>` : ""}</td><td>${r.lowStockThreshold}</td><td>${r.active ? "Active" : "Retired option"}</td></tr>`).join("")}</tbody></table></div><nav class="tools-pager" aria-label="Inventory pages"><button class="btn btn-outline btn-sm" id="stock-prev" ${data.page <= 1 ? "disabled" : ""}>Previous</button><span>${data.page} / ${data.pages}</span><button class="btn btn-outline btn-sm" id="stock-next" ${data.page >= data.pages ? "disabled" : ""}>Next</button></nav>` : `<p>No inventory matches these filters.</p>`;
    document.getElementById("stock-prev")?.addEventListener("click", () => { inventoryPage--; loadInventory(); }); document.getElementById("stock-next")?.addEventListener("click", () => { inventoryPage++; loadInventory(); });
  } catch (error) { if (read === inventoryRead) inventoryAlert(error.message, "error"); }
}
async function exportStock(event) { const button = event.currentTarget; button.disabled = true; try { await Api.download("/admin/inventory/export.csv?" + inventoryQuery(), "norda-inventory.csv"); } catch (error) { inventoryAlert(error.message, "error"); } finally { button.disabled = false; } }
function inventoryControls() { document.getElementById("inventory-file").disabled = inventoryBusy; document.getElementById("inventory-preview").disabled = inventoryBusy || !inventoryCsv; document.getElementById("inventory-apply").disabled = inventoryBusy || !inventoryPreview?.valid; }
async function readInventoryFile(event) {
  const file = event.target.files[0]; inventoryCsv = ""; inventoryPreview = null; document.getElementById("inventory-import-result").innerHTML = "";
  if (file && file.size > 700000) { inventoryAlert("Choose a UTF-8 CSV up to 700 KB.", "error"); inventoryControls(); return; }
  inventoryBusy = true; inventoryControls();
  try { if (file) inventoryCsv = await file.text(); } catch { inventoryAlert("The file could not be read.", "error"); }
  finally { inventoryBusy = false; inventoryControls(); }
}
function renderStockPreview(data) {
  return `<div class="alert alert-${data.valid ? "success" : "warning"}">${data.rowCount} stock rows across ${data.productCount} products. ${data.valid ? "Preview passed. Review the changes before applying." : "Some products changed. Re-export and preview a fresh CSV."}</div><div class="tools-preview table-wrap"><table class="data-table"><thead><tr><th>Product / SKU</th><th>Current → new stock</th><th>Alert at</th></tr></thead><tbody>${data.changes.map((r) => `<tr><td>${escapeHtml(r.name)}<small>${escapeHtml(r.sku)}</small></td><td>${r.from} → <strong>${r.to}</strong></td><td>${r.lowStockThreshold}</td></tr>`).join("")}</tbody></table></div>${data.results.filter((r) => !r.valid).map((r) => `<p class="danger-text">${escapeHtml(r.name)}: ${escapeHtml(r.message)}</p>`).join("")}`;
}
async function previewStock() {
  if (inventoryBusy || !inventoryCsv) return; inventoryBusy = true; inventoryPreview = null; inventoryControls();
  try { const data = await Api.post("/admin/inventory/preview", { csv: inventoryCsv }); if (Api.getUser()?._id !== inventoryOwner) return; inventoryPreview = data; document.getElementById("inventory-import-result").innerHTML = renderStockPreview(data); }
  catch (error) { inventoryAlert(error.message, "error"); }
  finally { inventoryBusy = false; inventoryControls(); }
}
function inventoryImportKey(sourceHash) {
  const key = "norda_inventory_import:" + inventoryOwner + ":" + sourceHash;
  let value; try { value = sessionStorage.getItem(key); } catch {}
  if (!value || !/^[a-zA-Z0-9_-]{12,80}$/.test(value)) { value = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "norda-" + Date.now() + "-" + Math.random().toString(36).slice(2); try { sessionStorage.setItem(key, value); } catch {} }
  return value;
}
function renderStockResult(job) {
  const applied = job.entries.filter((r) => r.status === "applied").length;
  return `<div class="alert alert-${applied === job.entries.length ? "success" : "warning"}">${applied} of ${job.entries.length} products updated. ${applied === job.entries.length ? "Export again before making further changes." : "Review the remaining results and export fresh stock before another import."}</div><div class="tools-preview table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Result</th><th>Details</th></tr></thead><tbody>${job.entries.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.status)}</td><td class="import-status">${escapeHtml(r.message)}</td></tr>`).join("")}</tbody></table></div>`;
}
async function applyStock() {
  if (inventoryBusy || !inventoryPreview?.valid || Api.getUser()?._id !== inventoryOwner) return;
  inventoryBusy = true; inventoryControls();
  try {
    const job = await Api.post("/admin/inventory/import", { csv: inventoryCsv, sourceHash: inventoryPreview.sourceHash, requestKey: inventoryImportKey(inventoryPreview.sourceHash) });
    if (Api.getUser()?._id !== inventoryOwner) return;
    document.getElementById("inventory-import-result").innerHTML = renderStockResult(job); inventoryPreview = null; await loadInventory();
  } catch (error) { inventoryAlert(error.message + " If the request timed out, use Apply again with this same file to check the recorded result.", "error"); }
  finally { inventoryBusy = false; inventoryControls(); }
}

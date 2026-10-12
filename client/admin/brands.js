let brandsCache = [];

document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  if (!requireAdmin()) return;
  renderAdminShell("brands");
  document.getElementById("new-brand-btn").addEventListener("click", () => openBrandModal());
  document.getElementById("cancel-brand-btn").addEventListener("click", closeBrandModal);
  document.getElementById("brand-form").addEventListener("submit", saveBrand);
  await loadBrands();
});

async function loadBrands() {
  const root = document.getElementById("brands-root");
  try {
    brandsCache = await Api.get("/brands/manage");
    if (!brandsCache.length) {
      root.innerHTML = `<div class="empty-state"><h2>No brands yet</h2><p>Create a brand before adding its products.</p></div>`;
      return;
    }
    root.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Brand</th><th>Slug</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>${brandsCache
      .map((brand) => `<tr><td><strong>${escapeHtml(brand.name)}</strong><small>${escapeHtml(brand.description || "No description")}</small></td><td>${escapeHtml(brand.slug)}</td><td><span class="status-pill ${brand.isActive ? "status-delivered" : "status-cancelled"}">${brand.isActive ? "Active" : "Hidden"}</span></td><td class="row-actions"><button class="btn btn-outline btn-sm" data-edit="${brand._id}">Edit</button><button class="btn btn-danger btn-sm" data-delete="${brand._id}">Delete</button></td></tr>`)
      .join("")}</tbody></table></div>`;
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openBrandModal(brandsCache.find((brand) => brand._id === button.dataset.edit))));
    root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteBrand(button.dataset.delete)));
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><h2>Brands unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function openBrandModal(brand = null) {
  document.getElementById("modal-title").textContent = brand ? "Edit brand" : "New brand";
  document.getElementById("brand-id").value = brand?._id || "";
  document.getElementById("brand-name").value = brand?.name || "";
  document.getElementById("brand-description").value = brand?.description || "";
  document.getElementById("brand-logo").value = brand?.logo || "";
  document.getElementById("brand-active").checked = brand ? brand.isActive : true;
  document.getElementById("modal-alert").innerHTML = "";
  openDialog("brand-modal");
  document.getElementById("brand-name").focus();
}

function closeBrandModal() {
  closeDialog("brand-modal");
}

async function saveBrand(event) {
  event.preventDefault();
  const button = document.getElementById("save-brand-btn");
  button.disabled = true;
  try {
    const id = document.getElementById("brand-id").value;
    const payload = { name: document.getElementById("brand-name").value.trim(), description: document.getElementById("brand-description").value.trim(), logo: document.getElementById("brand-logo").value.trim(), isActive: document.getElementById("brand-active").checked };
    if (id) await Api.put("/brands/" + id, payload);
    else await Api.post("/brands", payload);
    modal.dataset.busy = "false";
    closeBrandModal();
    showAdminAlert("Brand saved.", "success");
    await loadBrands();
  } catch (error) {
    showAdminAlert(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function deleteBrand(id) {
  if (!confirm("Delete this brand? Brands assigned to products cannot be deleted.")) return;
  try { await Api.del("/brands/" + id); showAdminAlert("Brand deleted.", "success"); await loadBrands(); }
  catch (error) { showAdminAlert(error.message, "error"); }
}

function showAdminAlert(message, type) {
  const box = document.getElementById(!document.getElementById("brand-modal").classList.contains("hidden") ? "modal-alert" : "alert-box");
  box.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;

}

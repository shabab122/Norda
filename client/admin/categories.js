let categoriesCache = [];

document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  if (!requireAdmin()) return;
  renderAdminShell("categories");
  document.getElementById("new-category-btn").addEventListener("click", () => openModal());
  document.getElementById("cancel-category-btn").addEventListener("click", closeModal);
  document.getElementById("category-form").addEventListener("submit", saveCategory);
  await loadCategories();
});

async function loadCategories() {
  const root = document.getElementById("categories-root");
  try {
    categoriesCache = await Api.get("/categories");
    if (!categoriesCache.length) {
      root.innerHTML = `<div class="empty-state"><h2>No categories yet</h2><p>Create a category before publishing products.</p></div>`;
      return;
    }
    root.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Category</th><th>Slug</th><th>Visual</th><th>Actions</th></tr></thead><tbody>${categoriesCache.map((category) => `<tr><td><strong>${escapeHtml(category.name)}</strong></td><td>${escapeHtml(category.slug)}</td><td>${category.image ? `<a class="text-link" href="${escapeHtml(resolveImage(category.image))}" target="_blank" rel="noreferrer">Open image ↗</a>` : `<span class="muted">No image</span>`}</td><td class="row-actions"><button class="btn btn-outline btn-sm" data-edit="${category._id}">Edit</button><button class="btn btn-danger btn-sm" data-delete="${category._id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openModal(categoriesCache.find((category) => category._id === button.dataset.edit))));
    root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteCategory(button.dataset.delete)));
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><h2>Categories unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function openModal(category = null) {
  document.getElementById("modal-title").textContent = category ? "Edit category" : "New category";
  document.getElementById("category-id").value = category?._id || "";
  document.getElementById("category-name").value = category?.name || "";
  document.getElementById("category-image").value = category?.image || "";
  document.getElementById("modal-alert").innerHTML = "";
  openDialog("category-modal");
  document.getElementById("category-name").focus();
}

function closeModal() { closeDialog("category-modal"); }

async function saveCategory(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  const modal = document.getElementById("category-modal"); modal.dataset.busy = "true";
  const id = document.getElementById("category-id").value;
  const payload = { name: document.getElementById("category-name").value.trim(), image: document.getElementById("category-image").value.trim() };
  try {
    if (id) await Api.put("/categories/" + id, payload);
    else await Api.post("/categories", payload);
    modal.dataset.busy = "false";
    closeModal();
    showTopAlert("Category saved.", "success");
    await loadCategories();
  } catch (error) { showTopAlert(error.message, "error"); }
  finally { button.disabled = false; modal.dataset.busy = "false"; }
}

async function deleteCategory(id) {
  if (!confirm("Delete this category? Categories in use cannot be removed.")) return;
  try { await Api.del("/categories/" + id); showTopAlert("Category deleted.", "success"); await loadCategories(); }
  catch (error) { showTopAlert(error.message, "error"); }
}

function showTopAlert(message, type) {
  const box = document.getElementById(!document.getElementById("category-modal").classList.contains("hidden") ? "modal-alert" : "alert-box");
  box.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;

}

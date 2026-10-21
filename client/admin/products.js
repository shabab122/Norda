let categoriesCache = [];
let brandsCache = [];
let productsPage = 1;
let imagesDraft = [];
let editedProduct = null;
let productListRequest = 0;

document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  if (!requireAdmin()) return;
  renderAdminShell("products");
  document.getElementById("new-product-btn").addEventListener("click", () => openModal());
  document.getElementById("cancel-product-btn").addEventListener("click", closeModal);
  document.getElementById("product-form").addEventListener("submit", saveProduct);
  document.getElementById("product-image-file").addEventListener("change", addImageFiles);
  document.getElementById("product-search-form").addEventListener("submit", (event) => { event.preventDefault(); productsPage = 1; loadProducts(); });
  for (const id of ["category-filter", "brand-filter", "archive-filter"]) document.getElementById(id).addEventListener("change", () => { productsPage = 1; loadProducts(); });
  try { await loadCatalogOptions(); await loadProducts(); }
  catch (error) { document.getElementById("products-root").innerHTML = `<div class="empty-state"><h2>Catalog unavailable</h2><p>${escapeHtml(error.message)}</p></div>`; }
});
async function loadCatalogOptions() {
  [categoriesCache, brandsCache] = await Promise.all([Api.get("/categories"), Api.get("/brands/manage")]);
  const categories = categoriesCache.map((category) => `<option value="${escapeHtml(category._id)}">${escapeHtml(category.name)}</option>`).join("");
  const brands = brandsCache.map((brand) => `<option value="${escapeHtml(brand._id)}">${escapeHtml(brand.name)}${brand.isActive ? "" : " (hidden)"}</option>`).join("");
  document.getElementById("product-category").innerHTML = categories;
  document.getElementById("product-brand").innerHTML = `<option value="">Choose a brand</option>` + brands;
  document.getElementById("category-filter").innerHTML = `<option value="">All categories</option>` + categories;
  document.getElementById("brand-filter").innerHTML = `<option value="">All brands</option>` + brands;
}
async function loadProducts() {
  const request = ++productListRequest;
  const root = document.getElementById("products-root"); root.innerHTML = `<span class="spinner">Loading products…</span>`;
  const query = new URLSearchParams({ limit: "20", page: String(productsPage), sort: "newest", archived: document.getElementById("archive-filter").value });
  for (const [key, id] of [["keyword", "product-search"], ["category", "category-filter"], ["brand", "brand-filter"]]) {
    const value = document.getElementById(id).value.trim(); if (value) query.set(key, value);
  }
  try {
    const data = await Api.get("/products/manage?" + query);
    if (request !== productListRequest) return;
    if (!data.products.length && productsPage > data.pages) { productsPage = data.pages; return loadProducts(); }
    if (!data.products.length) { root.innerHTML = `<div class="empty-state"><h2>No products found</h2><p>Try another filter or add your first product.</p></div>`; return; }
    root.innerHTML = `<div class="admin-list-summary"><span>${data.total} product${data.total === 1 ? "" : "s"}</span><span>Page ${data.page} of ${data.pages}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Category</th><th>Brand</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>${data.products.map(productRow).join("")}</tbody></table></div>${productPagination(data.page, data.pages)}`;
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try { openModal(await Api.get("/products/manage/" + button.dataset.edit)); } catch (error) { showTopAlert(error.message, "error"); }
      finally { button.disabled = false; }
    }));
    root.querySelectorAll("[data-archive]").forEach((button) => button.addEventListener("click", () => archiveProduct(button)));
    root.querySelectorAll("[data-restore]").forEach((button) => button.addEventListener("click", () => restoreProduct(button)));
    root.querySelectorAll("[data-product-page]").forEach((button) => button.addEventListener("click", () => { productsPage = Number(button.dataset.productPage); loadProducts(); }));
  } catch (error) { if (request === productListRequest) root.innerHTML = `<div class="empty-state"><h2>Products unavailable</h2><p>${escapeHtml(error.message)}</p></div>`; }
}
function productPagination(page, pages) {
  if (pages <= 1) return "";
  return `<nav class="admin-pagination" aria-label="Product pages"><span>Showing page ${page} of ${pages}</span><div><button class="btn btn-outline btn-sm" data-product-page="${page - 1}" ${page === 1 ? "disabled" : ""}>Previous</button><button class="btn btn-outline btn-sm" data-product-page="${page + 1}" ${page === pages ? "disabled" : ""}>Next</button></div></nav>`;
}
function productRow(product) {
  const image = resolveImage(product.images?.[0] || "/assets/products/collection.svg");
  return `<tr><td><div class="table-product"><div class="table-thumb"><img src="${escapeHtml(image)}" alt="" /></div><div><strong>${escapeHtml(product.name)}</strong><small>${product.isArchived ? "Archived" : product.isFeatured ? "Featured product" : "Active product"} · ${product.images?.length || 0} image(s)</small></div></div></td><td>${escapeHtml(product.category?.name || "—")}</td><td>${escapeHtml(product.brandRef?.name || product.brand || "Generic")}</td><td><strong>${money(product.effectivePrice ?? (product.discountPrice > 0 ? product.discountPrice : product.price))}</strong>${product.discountPrice > 0 ? `<small><s>${money(product.price)}</s></small>` : ""}</td><td><span class="${product.stock <= 5 ? "danger-text" : ""}">${product.stock}</span></td><td class="row-actions"><button class="btn btn-outline btn-sm" data-edit="${escapeHtml(product._id)}">Edit</button>${product.isArchived ? `<button class="btn btn-outline btn-sm" data-restore="${escapeHtml(product._id)}">Restore</button>` : `<button class="btn btn-danger btn-sm" data-archive="${escapeHtml(product._id)}">Archive</button>`}</td></tr>`;
}
function openModal(product = null) {
  if (!categoriesCache.length || !brandsCache.length) { showTopAlert("Create at least one category and brand before adding products.", "error"); return; }
  releaseDraftPreviews(); editedProduct = product;
  imagesDraft = (product?.images || []).map((url) => ({ url }));
  document.getElementById("modal-title").textContent = product ? "Edit product" : "New product";
  document.getElementById("modal-alert").innerHTML = "";
  document.getElementById("product-id").value = product?._id || "";
  document.getElementById("product-name").value = product?.name || "";
  document.getElementById("product-category").value = product?.category?._id || product?.category || categoriesCache[0]._id;
  document.getElementById("product-brand").value = product?.brandRef?._id || product?.brandRef || "";
  document.getElementById("product-price").value = product?.price ?? "";
  document.getElementById("product-discount").value = product?.discountPrice ?? "";
  document.getElementById("product-stock").value = product?.stock ?? "";
  document.getElementById("product-description").value = product?.description || "";
  document.getElementById("product-featured").checked = Boolean(product?.isFeatured);
  document.getElementById("product-active").checked = !product?.isArchived;
  document.getElementById("product-image-file").value = "";
  document.getElementById("product-modal").dataset.busy = "false";
  initVariantEditor(product);
  renderImages(); openDialog("product-modal"); document.getElementById("product-name").focus();
}
function releaseDraftPreviews() { for (const image of imagesDraft) if (image.preview) URL.revokeObjectURL(image.preview); }
function closeModal() {
  if (document.getElementById("product-modal").dataset.busy === "true") return;
  closeDialog("product-modal"); releaseDraftPreviews(); imagesDraft = [];
}
function addImageFiles(event) {
  const files = [...event.target.files]; event.target.value = "";
  if (files.length + imagesDraft.length > 6) { showTopAlert("A product can have up to 6 images.", "error"); return; }
  if (files.some((file) => !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size > 5 * 1024 * 1024)) { showTopAlert("Choose JPG, PNG, WebP or GIF files no larger than 5 MB each.", "error"); return; }
  imagesDraft.push(...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))); renderImages();
}
function renderImages() {
  const root = document.getElementById("product-images");
  root.innerHTML = imagesDraft.map((image, index) => `<div class="image-edit-card"><img src="${escapeHtml(image.preview || resolveImage(image.url))}" alt="Product image ${index + 1}" /><div class="image-edit-actions"><button type="button" data-image-left="${index}" aria-label="Move image ${index + 1} left" ${index === 0 ? "disabled" : ""}>←</button><button type="button" data-image-right="${index}" aria-label="Move image ${index + 1} right" ${index === imagesDraft.length - 1 ? "disabled" : ""}>→</button><button type="button" data-image-remove="${index}" aria-label="Remove image ${index + 1}">Remove</button></div><small>${index === 0 ? "Cover image" : "Gallery image " + (index + 1)}</small></div>`).join("");
  root.querySelectorAll("[data-image-remove]").forEach((button) => button.addEventListener("click", () => { const [image] = imagesDraft.splice(Number(button.dataset.imageRemove), 1); if (image.preview) URL.revokeObjectURL(image.preview); renderImages(); }));
  for (const direction of ["left", "right"]) root.querySelectorAll("[data-image-" + direction + "]").forEach((button) => button.addEventListener("click", () => { const index = Number(button.dataset[direction === "left" ? "imageLeft" : "imageRight"]); const next = index + (direction === "left" ? -1 : 1); [imagesDraft[index], imagesDraft[next]] = [imagesDraft[next], imagesDraft[index]]; renderImages(); }));
}
async function saveProduct(event) {
  event.preventDefault();
  const button = document.getElementById("save-product-btn"); if (button.disabled) return;
  const modal = document.getElementById("product-modal"); button.disabled = true; button.textContent = "Saving…"; modal.dataset.busy = "true";
  try {
    for (const image of imagesDraft) {
      if (!image.file) continue;
      const data = new FormData(); data.append("image", image.file);
      image.url = (await Api.post("/uploads", data, { isForm: true })).url; image.file = null;
    }
    const variants = await variantPayload();
    const id = document.getElementById("product-id").value;
    const stock = Number(document.getElementById("product-stock").value);
    const payload = {
      name: document.getElementById("product-name").value.trim(), category: document.getElementById("product-category").value,
      brandRef: document.getElementById("product-brand").value, price: Number(document.getElementById("product-price").value),
      discountPrice: Number(document.getElementById("product-discount").value) || 0,
      description: document.getElementById("product-description").value.trim(),
      isFeatured: document.getElementById("product-featured").checked, isArchived: !document.getElementById("product-active").checked,
      images: imagesDraft.map((image) => image.url),
      ...(!id || stock !== editedProduct.stock ? { stock, ...(id ? { expectedStock: editedProduct.stock } : {}) } : {}),
    };
    if (variants) {
      const active = variants.filter((v) => v.isActive !== false);
      const cheapest = [...(active.length ? active : variants)].sort((a, b) => (a.discountPrice || a.price) - (b.discountPrice || b.price))[0];
      Object.assign(payload, { variants, price: cheapest.price, discountPrice: cheapest.discountPrice || 0, stock: variants.reduce((n, v) => n + v.stock, 0) });
      delete payload.expectedStock;
    }
    if (id) await Api.put("/products/" + id, payload); else await Api.post("/products", payload);
    modal.dataset.busy = "false"; closeModal(); showTopAlert("Product saved.", "success"); await loadProducts();
  } catch (error) { showTopAlert(error.message, "error"); }
  finally { button.disabled = false; button.textContent = "Save product"; modal.dataset.busy = "false"; }
}
async function archiveProduct(button) {
  if (!confirm("Remove this product from the storefront? Existing order history will remain available.")) return;
  button.disabled = true;
  try { await Api.del("/products/" + button.dataset.archive); showTopAlert("Product archived.", "success"); await loadProducts(); }
  catch (error) { showTopAlert(error.message, "error"); button.disabled = false; }
}
async function restoreProduct(button) {
  button.disabled = true;
  try { await Api.put("/products/" + button.dataset.restore, { isArchived: false }); showTopAlert("Product restored.", "success"); await loadProducts(); }
  catch (error) { showTopAlert(error.message, "error"); button.disabled = false; }
}
function showTopAlert(message, type) {
  const open = !document.getElementById("product-modal").classList.contains("hidden");
  const box = document.getElementById(open ? "modal-alert" : "alert-box"); box.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
}

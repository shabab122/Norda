let variantsDraft = [];
function initVariantEditor(product) {
  variantsDraft = (product?.variants || []).map((v) => ({ ...v, expectedStock: v.stock, images: [...(v.images || [])], files: [] }));
  const mode = document.getElementById("product-variants-enabled");
  mode.checked = variantsDraft.length > 0; mode.disabled = variantsDraft.length > 0;
  renderVariantEditor(); syncVariantMode();
}
function readVariantEditor() {
  const cards = [...document.querySelectorAll("[data-variant-card]")];
  return cards.map((card, index) => {
    const original = variantsDraft[index] || {}, read = (field) => card.querySelector('[data-variant-field="' + field + '"]').value.trim();
    return { ...original, sku: read("sku"), size: read("size"), color: read("color"), price: Number(read("price")), discountPrice: Number(read("discountPrice") || 0), stock: Number(read("stock")), lowStockThreshold: Number(card.querySelector('[data-variant-field="lowStockThreshold"]')?.value ?? original.lowStockThreshold ?? 5), isActive: card.querySelector('[data-variant-field="isActive"]').checked, images: read("images").split(/\r?\n/).map((s) => s.trim()).filter(Boolean), files: [...(original.files || []), ...card.querySelector('[data-variant-field="files"]').files] };
  });
}
function syncVariantMode() {
  const enabled = document.getElementById("product-variants-enabled").checked;
  document.getElementById("variant-editor").hidden = !enabled;
  for (const id of ["product-price", "product-discount", "product-stock", "product-low-stock"]) document.getElementById(id).disabled = enabled;
  document.querySelectorAll("[data-variant-card] input, [data-variant-card] textarea").forEach((input) => { input.disabled = !enabled; });
}
function renderVariantEditor() {
  const root = document.getElementById("variant-rows");
  root.innerHTML = variantsDraft.map((v, index) => `<section class="variant-editor-card" data-variant-card="${index}"><div class="variant-card-heading"><strong>Option ${index + 1}</strong>${v._id ? '<small>Deactivate to retire this option</small>' : `<button class="text-button danger-text" type="button" data-remove-variant="${index}">Remove</button>`}</div><div class="variant-fields">
    ${[["sku", "SKU", "text", v.sku || ""], ["size", "Size (optional)", "text", v.size || ""], ["color", "Color (optional)", "text", v.color || ""], ["price", "Price (BDT)", "number", v.price || ""], ["discountPrice", "Discount price", "number", v.discountPrice || 0], ["stock", "Independent stock", "number", v.stock ?? 0], ["lowStockThreshold", "Low-stock alert at", "number", v.lowStockThreshold ?? 5]].map(([field, label, type, value]) => `<label for="variant-${index}-${field}">${label}<input id="variant-${index}-${field}" data-variant-field="${field}" type="${type}" value="${escapeHtml(value)}" ${type === "number" ? `min="${field === "price" ? "0.01" : "0"}" step="${["stock", "lowStockThreshold"].includes(field) ? "1" : "0.01"}"` : 'maxlength="64"'} ${["sku", "price", "stock"].includes(field) ? "required" : ""} ${v._id && ["sku", "size", "color"].includes(field) ? "readonly" : ""} /></label>`).join("")}</div>
    <label for="variant-${index}-images">Photo URLs (optional, one per line, up to 6)<textarea id="variant-${index}-images" data-variant-field="images" rows="2">${escapeHtml((v.images || []).join("\n"))}</textarea></label><label for="variant-${index}-files">Upload variant photos<input id="variant-${index}-files" data-variant-field="files" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" /></label>${v.files?.length ? `<small>${v.files.length} selected file(s) retained</small>` : ""}<label class="check-field"><input data-variant-field="isActive" type="checkbox" ${v.isActive !== false ? "checked" : ""} />Available to customers</label></section>`).join("");
  root.querySelectorAll("[data-remove-variant]").forEach((button) => button.addEventListener("click", () => { variantsDraft = readVariantEditor(); variantsDraft.splice(Number(button.dataset.removeVariant), 1); renderVariantEditor(); }));
}
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("product-variants-enabled").addEventListener("change", () => { if (document.getElementById("product-variants-enabled").checked && !variantsDraft.length) { variantsDraft = [{ sku: "", size: "", color: "", price: Number(document.getElementById("product-price").value) || 0, stock: 0, images: [], files: [] }]; renderVariantEditor(); } syncVariantMode(); });
  document.getElementById("add-variant-btn").addEventListener("click", () => { if (variantsDraft.length >= 50) return showTopAlert("A product supports up to 50 options.", "error"); variantsDraft = readVariantEditor(); variantsDraft.push({ sku: "", size: "", color: "", price: Number(document.getElementById("product-price").value) || 0, stock: 0, images: [], files: [] }); renderVariantEditor(); });
});
async function variantPayload() {
  if (!document.getElementById("product-variants-enabled").checked) return null;
  variantsDraft = readVariantEditor();
  if (!variantsDraft.length) throw new Error("Add at least one size/color option.");
  const payload = [];
  try {
  for (const variant of variantsDraft) {
    if ((variant.images.length + variant.files.length) > 6) throw new Error("Each variant can have up to six photos.");
    while (variant.files.length) {
      const file = variant.files[0];
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Variant photos must be JPG, PNG, WebP or GIF and no larger than 5 MB.");
      const data = new FormData(); data.append("image", file); variant.images.push((await Api.post("/uploads", data, { isForm: true })).url); variant.files.shift();
    }
    variant.files = [];
    const { files, ...record } = variant; payload.push(record);
  }
  return payload;
  } finally { renderVariantEditor(); syncVariantMode(); }
}

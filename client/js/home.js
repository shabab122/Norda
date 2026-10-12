document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader("home");
  renderFooter();
  document.querySelectorAll("[data-icon]").forEach((element) => { element.innerHTML = icon(element.dataset.icon); });

  await Promise.all([loadCategories(), loadBrands(), loadHomeProducts(), loadStoreConfig()]);
});

async function loadStoreConfig() {
  try {
    const store = await Api.get("/store/config");
    document.getElementById("free-delivery-threshold").textContent =
      "Free delivery from " + money(store.freeShippingThreshold);
  } catch {
    // The static default remains visible if configuration cannot be loaded.
  }
}

async function loadCategories() {
  const strip = document.getElementById("category-strip");
  try {
    const categories = await Api.get("/categories");
    document.getElementById("stat-categories").textContent = categories.length;
    strip.innerHTML = categories
      .map(
        (category, index) => `
          <a class="category-card category-tone-${(index % 5) + 1}" href="products.html?category=${encodeURIComponent(category._id)}">
            <img class="category-visual" src="${escapeHtml(resolveImage(category.image || categoryVisual(category.name)))}" alt="" loading="lazy" />
            <strong>${escapeHtml(category.name)}</strong>
            <span class="category-arrow" aria-hidden="true">↗</span>
          </a>
        `
      )
      .join("");
  } catch {
    strip.innerHTML = `<div class="empty-inline">Categories are unavailable right now.</div>`;
  }
}

async function loadBrands() {
  const strip = document.getElementById("brand-strip");
  try {
    const brands = await Api.get("/brands");
    strip.innerHTML = brands.length
      ? brands
          .slice(0, 10)
          .map(
            (brand) =>
              `<a href="products.html?brand=${encodeURIComponent(brand._id)}">${escapeHtml(brand.name)}</a>`
          )
          .join("")
      : `<span>Brand collections will appear here.</span>`;
  } catch {
    strip.innerHTML = `<span>Brand collections will appear here.</span>`;
  }
}

async function loadHomeProducts() {
  await Promise.all([
    loadGrid("featured-grid", "/products?featured=true&limit=8"),
    loadGrid("new-grid", "/products?sort=newest&limit=8"),
  ]);
}

async function loadGrid(elementId, path) {
  const element = document.getElementById(elementId);
  try {
    const data = await Api.get(path);
    element.innerHTML = data.products.length
      ? data.products.map(productCardHtml).join("")
      : `<div class="empty-state">No products are available yet.</div>`;
  } catch {
    element.innerHTML = `<div class="empty-state">Products could not be loaded.</div>`;
  }
}

function categoryVisual(name) {
  const value = name.toLowerCase();
  const image = value.includes("electronic") ? "headphones" : value.includes("fashion") ? "jacket" : value.includes("kitchen") || value.includes("home") ? "kettle" : value.includes("sport") ? "dumbbells" : value.includes("book") ? "clean-code" : "collection";
  return "/assets/products/" + image + ".svg";
}

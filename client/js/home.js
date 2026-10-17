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
  const results = await Promise.allSettled([
    Api.get("/products?featured=true&limit=24"),
    Api.get("/products?sort=newest&limit=100"),
  ]);
  const ids = new Set();
  const covers = new Set();
  for (const [index, elementId] of ["featured-grid", "new-grid"].entries()) {
    const element = document.getElementById(elementId);
    const result = results[index];
    if (result.status !== "fulfilled") {
      element.innerHTML = `<div class="empty-state">Products could not be loaded.</div>`;
      continue;
    }
    const products = distinctHomeProducts(result.value.products || [], ids, covers);
    element.innerHTML = products.length ? products.map(productCardHtml).join("")
      : `<div class="empty-state">${index ? "More new arrivals will appear here soon." : "No featured products are available yet."}</div>`;
  }
}

function distinctHomeProducts(products, ids, covers, limit = 8) {
  const selected = [];
  for (const product of products) {
    const id = String(product._id);
    const cover = product.images?.[0] || "";
    if (ids.has(id) || (cover && covers.has(cover))) continue;
    ids.add(id);
    if (cover) covers.add(cover);
    selected.push(product);
    if (selected.length === limit) break;
  }
  return selected;
}

function categoryVisual(name) {
  const value = name.toLowerCase();
  const image = value.includes("electronic") ? "headphones" : value.includes("fashion") ? "jacket" : value.includes("kitchen") || value.includes("home") ? "kettle" : value.includes("sport") ? "dumbbells" : value.includes("book") ? "clean-code" : "collection";
  return "/assets/products/" + image + ".svg";
}

const state = {
  category: "",
  brand: "",
  keyword: "",
  featured: "",
  minPrice: "",
  maxPrice: "",
  sort: "newest",
  page: 1,
  limit: 12,
};

const names = { categories: new Map(), brands: new Map() };

document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader("products");
  renderFooter();
  document.getElementById("filter-toggle").addEventListener("click", (event) => {
    const open = document.getElementById("catalog-filters").classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });

  const params = new URLSearchParams(window.location.search);
  for (const key of ["category", "brand", "keyword", "featured", "minPrice", "maxPrice", "sort"]) {
    if (params.get(key)) state[key] = params.get(key);
  }
  state.page = Math.max(Number(params.get("page")) || 1, 1);
  if (!["newest", "price_asc", "price_desc", "top_rated"].includes(state.sort)) {
    state.sort = "newest";
  }

  document.getElementById("sort-select").value = state.sort;
  document.getElementById("min-price").value = state.minPrice;
  document.getElementById("max-price").value = state.maxPrice;
  if (state.keyword) {
    document.getElementById("shop-title").textContent = 'Results for "' + state.keyword + '"';
  }

  document.getElementById("sort-select").addEventListener("change", (event) => {
    state.sort = event.target.value;
    state.page = 1;
    loadProducts();
  });
  document.getElementById("price-form").addEventListener("submit", applyPriceFilter);
  document.getElementById("clear-filters").addEventListener("click", clearFilters);

  await Promise.all([loadCategories(), loadBrands()]);
  await loadProducts();
});

async function loadCategories() {
  const list = document.getElementById("filter-categories");
  try {
    const categories = await Api.get("/categories");
    categories.forEach((item) => names.categories.set(item._id, item.name));
    renderFilterList(list, categories, "category", "All categories");
  } catch {
    list.innerHTML = `<li>Categories unavailable</li>`;
  }
}

async function loadBrands() {
  const list = document.getElementById("filter-brands");
  try {
    const brands = await Api.get("/brands");
    brands.forEach((item) => names.brands.set(item._id, item.name));
    renderFilterList(list, brands, "brand", "All brands");
  } catch {
    list.innerHTML = `<li>Brands unavailable</li>`;
  }
}

function renderFilterList(list, items, key, allLabel) {
  list.innerHTML =
    `<li><button type="button" data-filter-value="" class="${state[key] ? "" : "active"}">${allLabel}</button></li>` +
    items
      .map(
        (item) =>
          `<li><button type="button" data-filter-value="${item._id}" class="${state[key] === item._id ? "active" : ""}">${escapeHtml(item.name)}</button></li>`
      )
      .join("");
  list.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state[key] = button.dataset.filterValue;
      state.page = 1;
      list.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      loadProducts();
    });
  });
}

function applyPriceFilter(event) {
  event.preventDefault();
  const min = document.getElementById("min-price").value;
  const max = document.getElementById("max-price").value;
  const error = document.getElementById("price-error");
  if (min && max && Number(min) > Number(max)) {
    error.textContent = "Minimum price cannot be greater than maximum price.";
    return;
  }
  error.textContent = "";
  state.minPrice = min;
  state.maxPrice = max;
  state.page = 1;
  loadProducts();
}

function clearFilters() {
  Object.assign(state, {
    category: "",
    brand: "",
    keyword: "",
    featured: "",
    minPrice: "",
    maxPrice: "",
    sort: "newest",
    page: 1,
  });
  document.getElementById("min-price").value = "";
  document.getElementById("max-price").value = "";
  document.getElementById("sort-select").value = "newest";
  document.querySelectorAll(".filters-list button").forEach((button) => {
    button.classList.toggle("active", button.dataset.filterValue === "");
  });
  document.getElementById("shop-title").textContent = "Shop useful things";
  loadProducts();
}

function buildQuery() {
  const query = new URLSearchParams();
  for (const key of ["category", "brand", "keyword", "featured", "minPrice", "maxPrice", "sort"]) {
    if (state[key]) query.set(key, state[key]);
  }
  query.set("page", state.page);
  query.set("limit", state.limit);
  return query;
}

let catalogRequest = 0;
async function loadProducts() {
  const request = ++catalogRequest;
  const grid = document.getElementById("product-grid");
  const resultCount = document.getElementById("result-count");
  grid.innerHTML = Array.from({ length: 8 }, () => `<div class="product-skeleton"></div>`).join("");
  const query = buildQuery();
  window.history.replaceState({}, "", "products.html?" + query.toString());

  try {
    const data = await Api.get("/products?" + query.toString());
    if (request !== catalogRequest) return;
    resultCount.textContent = data.total + " product" + (data.total === 1 ? "" : "s");
    grid.innerHTML = data.products.length
      ? data.products.map(productCardHtml).join("")
      : `<div class="empty-state"><h2>No matches found</h2><p>Try removing a filter or widening the price range.</p></div>`;
    renderActiveFilters();
    if (typeof refreshWishlistButtons === "function") refreshWishlistButtons();
    renderPagination(data.page, data.pages);
  } catch (error) {
    if (request !== catalogRequest) return;
    resultCount.textContent = "Products unavailable";
    grid.innerHTML = `<div class="empty-state"><h2>We could not load the catalog</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderActiveFilters() {
  const labels = [];
  if (state.category) labels.push(names.categories.get(state.category) || "Category");
  if (state.brand) labels.push(names.brands.get(state.brand) || "Brand");
  if (state.featured === "true") labels.push("Featured");
  if (state.minPrice) labels.push("From " + money(state.minPrice));
  if (state.maxPrice) labels.push("Up to " + money(state.maxPrice));
  document.getElementById("active-filters").innerHTML = labels
    .map((label) => `<span>${escapeHtml(label)}</span>`)
    .join("");
}

function renderPagination(page, pages) {
  const element = document.getElementById("pagination");
  if (pages <= 1) {
    element.innerHTML = "";
    return;
  }
  const visible = [];
  for (let number = 1; number <= pages; number += 1) {
    if (number === 1 || number === pages || Math.abs(number - page) <= 1) visible.push(number);
  }
  let previous = 0;
  const controls = [];
  for (const number of visible) {
    if (number - previous > 1) controls.push(`<span aria-hidden="true">…</span>`);
    controls.push(
      `<button type="button" data-page="${number}" class="${number === page ? "active" : ""}" aria-current="${number === page ? "page" : "false"}">${number}</button>`
    );
    previous = number;
  }
  element.innerHTML = controls.join("");
  element.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.page = Number(button.dataset.page);
      loadProducts();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

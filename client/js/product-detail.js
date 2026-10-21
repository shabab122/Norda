let activeProductId = "";
let productCartBusy = false;

document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader();
  renderFooter();
  activeProductId = new URLSearchParams(window.location.search).get("id") || "";
  if (!activeProductId) {
    document.getElementById("pd-root").innerHTML =
      `<div class="empty-state"><h1>Product not found</h1><a class="btn btn-primary" href="products.html">Return to shop</a></div>`;
    return;
  }
  await loadProduct();
});

async function loadProduct() {
  const root = document.getElementById("pd-root");
  try {
    const product = await Api.get("/products/" + encodeURIComponent(activeProductId));
    document.title = product.name + " — Norda";
    renderProduct(product);
    await loadReviews(product._id);
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><h1>This product is unavailable</h1><p>${escapeHtml(error.message)}</p><a class="btn btn-primary" href="products.html">Browse products</a></div>`;
  }
}

function renderProduct(product) {
  const hasVariants = Boolean(product.hasVariants || product.variants?.length);
  const discounted =
    product.discountPrice > 0 && Number(product.discountPrice) < Number(product.price);
  const price = discounted ? product.discountPrice : product.price;
  const brand = product.brandRef?.name || product.brand || "Norda selection";
  const images = (product.images?.length ? product.images : ["/assets/products/collection.svg"]).map(resolveImage).filter(Boolean);
  const mainVisual = images.length
    ? `<img id="main-product-image" src="${escapeHtml(images[0])}" alt="${escapeHtml(product.name)}" />`
    : `<div class="pd-fallback"><span>${escapeHtml(product.name)}</span></div>`;
  const stockText =
    product.stock === 0
      ? "Out of stock"
      : product.stock <= 5
        ? "Only " + product.stock + " left"
        : "Ready to dispatch";

  document.getElementById("pd-root").innerHTML = `
    <div class="breadcrumb">
      <a href="index.html">Home</a><span>/</span>
      <a href="products.html">Shop</a><span>/</span>
      ${escapeHtml(product.name)}
    </div>
    <section class="product-detail">
      <div class="pd-media">
        <div class="pd-gallery">${mainVisual}</div>
        ${
          images.length > 1 || hasVariants
            ? `<div class="pd-thumbnails">${images
                .map(
                  (image, index) =>
                    `<button type="button" data-image="${escapeHtml(image)}" class="${index === 0 ? "active" : ""}"><img src="${escapeHtml(image)}" alt="" /></button>`
                )
                .join("")}</div>`
            : ""
        }
      </div>
      <div class="pd-content">
        <span class="eyebrow">${escapeHtml(product.category?.name || "Collection")}</span>
        <h1 class="pd-title">${escapeHtml(product.name)}</h1>
        <div class="pd-rating">
          <span>${product.ratingCount ? "★ " + Number(product.ratingAverage).toFixed(1) : "No ratings yet"}</span>
          ${product.ratingCount ? `<a href="#reviews">${product.ratingCount} verified review${product.ratingCount === 1 ? "" : "s"}</a>` : ""}
        </div>
        <div class="pd-price" id="pd-price">
          <span class="price-now">${hasVariants ? "From " : ""}${money(price)}</span>
          ${discounted ? `<span class="price-old">${money(product.price)}</span><span class="sale-copy">Save ${money(product.price - product.discountPrice)}</span>` : ""}
        </div>
        <p class="pd-description">${escapeHtml(product.description || "More information will be added soon.")}</p>
        <div class="pd-meta-grid">
          <div><span>Brand</span><strong>${escapeHtml(brand)}</strong></div>
          <div><span>Availability</span><strong id="pd-stock" class="${product.stock === 0 ? "danger-text" : ""}">${hasVariants ? "Choose an option" : stockText}</strong></div>
        </div>
        ${hasVariants ? `<div class="variant-selection"><label for="pd-variant">Size / color</label><select id="pd-variant"><option value="">Choose your option…</option>${(product.variants || []).map((v) => `<option value="${escapeHtml(v._id)}" ${v.stock <= 0 ? "disabled" : ""}>${escapeHtml([v.size, v.color].filter(Boolean).join(" / "))} — ${money(v.discountPrice > 0 ? v.discountPrice : v.price)}${v.stock <= 0 ? " · Sold out" : ""}</option>`).join("")}</select><p id="pd-variant-info" class="field-help">Choose a size/color to see its price, photos and available stock.</p></div>` : ""}
        <div class="pd-actions">
          <label for="qty-input">Quantity</label>
          <input type="number" id="qty-input" class="qty-input" value="1" min="1" max="${Math.max(product.stock, 1)}" ${product.stock === 0 ? "disabled" : ""} />
          <button id="add-to-cart-btn" class="btn btn-primary" ${product.stock === 0 || hasVariants ? "disabled" : ""}>
            ${product.stock === 0 ? "Unavailable" : "Add to cart"}
          </button>
        </div>
        <div id="pd-alert" aria-live="polite"></div>
        <div class="purchase-notes">
          <p><strong>Secure checkout</strong><span>Pay through SSLCOMMERZ or choose cash on delivery.</span></p>
          <p><strong>Order invoice</strong><span>A printable invoice is created when you place an order.</span></p>
        </div>
      </div>
    </section>

    <section class="product-information" id="reviews">
      <div class="tabs" role="tablist" aria-label="Product information">
        <button class="tab-btn active" type="button" data-tab="details" role="tab" id="tab-control-details" aria-controls="tab-details" aria-selected="true" tabindex="0">Details</button>
        <button class="tab-btn" type="button" data-tab="reviews" role="tab" id="tab-control-reviews" aria-controls="tab-reviews" aria-selected="false" tabindex="-1">Reviews</button>
        <button class="tab-btn" type="button" data-tab="write-review" role="tab" id="tab-control-write-review" aria-controls="tab-write-review" aria-selected="false" tabindex="-1">Write a review</button>
      </div>
      <div class="tab-panel active" id="tab-details" role="tabpanel" aria-labelledby="tab-control-details">
        <h2>Product information</h2>
        <p>${escapeHtml(product.description || "No additional product information is available.")}</p>
        <dl class="detail-list">
          <div><dt>Category</dt><dd>${escapeHtml(product.category?.name || "—")}</dd></div>
          <div><dt>Brand</dt><dd>${escapeHtml(brand)}</dd></div>
          <div><dt>Stock</dt><dd>${product.stock} unit${product.stock === 1 ? "" : "s"}</dd></div>
        </dl>
      </div>
      <div class="tab-panel" id="tab-reviews" role="tabpanel" aria-labelledby="tab-control-reviews" hidden>
        <div id="review-list"><span class="spinner">Loading reviews…</span></div>
      </div>
      <div class="tab-panel" id="tab-write-review" role="tabpanel" aria-labelledby="tab-control-write-review" hidden>
        ${
          Api.isLoggedIn()
            ? `
              <div class="review-form-wrap">
                <h2>Share your experience</h2>
                <p>You can review this item after a delivered purchase.</p>
                <form id="review-form">
                  <div class="field">
                    <label for="review-rating">Rating</label>
                    <select id="review-rating">
                      <option value="5">5 — Excellent</option>
                      <option value="4">4 — Good</option>
                      <option value="3">3 — Average</option>
                      <option value="2">2 — Poor</option>
                      <option value="1">1 — Very poor</option>
                    </select>
                  </div>
                  <div class="field">
                    <label for="review-comment">Comment</label>
                    <textarea id="review-comment" rows="5" maxlength="1200" placeholder="What should another customer know?"></textarea>
                  </div>
                  <button type="submit" class="btn btn-primary">Submit review</button>
                </form>
                <div id="review-form-alert" aria-live="polite"></div>
              </div>
            `
            : `<p>Please <a class="text-link" href="login.html?next=product-detail.html%3Fid%3D${encodeURIComponent(product._id)}">sign in</a> to review a purchase.</p>`
        }
      </div>
    </section>
  `;

  bindProductInteractions(product);
  bindVariantSelection(product);
}

function bindProductInteractions(product) {
  document.querySelectorAll(".pd-thumbnails button").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("main-product-image").src = button.dataset.image;
      document.querySelectorAll(".pd-thumbnails button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });

  const tabs = [...document.querySelectorAll(".tab-btn")];
  const selectTab = (button, focus = false) => {
    tabs.forEach((tab) => { const active = tab === button; tab.classList.toggle("active", active); tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1; });
    document.querySelectorAll(".tab-panel").forEach((panel) => { const active = panel.id === button.getAttribute("aria-controls"); panel.classList.toggle("active", active); panel.hidden = !active; });
    if (focus) button.focus();
  };
  tabs.forEach((button, index) => {
    button.addEventListener("click", () => selectTab(button));
    button.addEventListener("keydown", (event) => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next !== null) { event.preventDefault(); selectTab(tabs[next], true); }
    });
  });
  if (["#reviews", "#write-review"].includes(window.location.hash)) selectTab(tabs[window.location.hash === "#reviews" ? 1 : 2]);

  document.getElementById("add-to-cart-btn")?.addEventListener("click", async () => {
    const button = document.getElementById("add-to-cart-btn");
    if (button.disabled || productCartBusy) return;
    productCartBusy = true; button.disabled = true;
    const account = Api.getUser()?._id;
    const alert = document.getElementById("pd-alert");
    const quantity = Number(document.getElementById("qty-input").value);
    try {
      if (!await addProductToCart(product._id, quantity, document.getElementById("pd-variant")?.value || undefined)) return;
      if (account !== Api.getUser()?._id) return;
      alert.innerHTML = `<div class="alert alert-success">Added to cart. <a href="cart.html">View cart</a></div>`;
      refreshCartBadge();
    } catch (error) {
      if (account === Api.getUser()?._id) alert.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)}</div>`;
    } finally { productCartBusy = false; const choice = document.getElementById("pd-variant"); button.disabled = choice ? !choice.value : product.stock === 0; }
  });

  document.getElementById("review-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const alert = document.getElementById("review-form-alert");
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    try {
      await Api.post("/reviews", {
        productId: product._id,
        rating: Number(document.getElementById("review-rating").value),
        comment: document.getElementById("review-comment").value.trim(),
      });
      alert.innerHTML = `<div class="alert alert-success">Your review has been saved.</div>`;
      document.getElementById("review-comment").value = "";
      await loadReviews(product._id);
      toast("Your review has been saved.");
    } catch (error) {
      alert.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)}</div>`;
    } finally { button.disabled = false; }
  });
}

async function loadReviews(productId) {
  const list = document.getElementById("review-list");
  if (!list) return;
  try {
    const reviews = await Api.get("/reviews/product/" + encodeURIComponent(productId));
    list.innerHTML = reviews.length
      ? reviews
          .map(
            (review) => `
              <article class="review-item">
                <div class="rev-head">
                  <div><strong>${escapeHtml(review.user?.name || "Customer")}</strong>${review.verifiedPurchase ? `<span class="verified-pill">Verified purchase</span>` : ""}</div>
                  <span class="stars" aria-label="${review.rating} out of 5 stars">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span>
                </div>
                <p>${escapeHtml(review.comment || "No written comment.")}</p>
                <time datetime="${review.createdAt}">${formatDate(review.createdAt)}</time>
                ${Api.isAdmin() || review.user?._id === Api.getUser()?._id ? `<button type="button" class="remove-link" data-delete-review="${escapeHtml(review._id)}">Delete review</button>` : ""}
              </article>
            `
          )
          .join("")
      : `<div class="empty-state compact"><h2>No reviews yet</h2><p>Delivered customers can be the first to review this item.</p></div>`;
    list.querySelectorAll("[data-delete-review]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Delete this review?")) return;
      button.disabled = true;
      try { await Api.del("/reviews/" + button.dataset.deleteReview); await loadReviews(productId); toast("Review deleted."); }
      catch (error) { button.disabled = false; toast(error.message, "error"); }
    }));
  } catch {
    list.innerHTML = `<p>Reviews could not be loaded.</p>`;
  }
}

function bindVariantSelection(product) {
  const select = document.getElementById("pd-variant"); if (!select) return;
  const update = () => {
    const variant = product.variants.find((v) => String(v._id) === select.value), button = document.getElementById("add-to-cart-btn"), quantity = document.getElementById("qty-input");
    button.disabled = productCartBusy || !variant || variant.stock < 1;
    quantity.disabled = !variant || variant.stock < 1;
    quantity.max = String(Math.max(variant?.stock || 0, 1)); quantity.value = "1";
    if (!variant) {
      document.getElementById("pd-stock").textContent = "Choose an option";
      document.getElementById("pd-variant-info").textContent = "Choose a size/color to see its price, photos and available stock.";
      document.getElementById("pd-price").innerHTML = `<span class="price-now">From ${money(product.discountPrice > 0 ? product.discountPrice : product.price)}</span>`;
      return;
    }
    const discounted = variant.discountPrice > 0 && variant.discountPrice < variant.price;
    document.getElementById("pd-price").innerHTML = `<span class="price-now">${money(discounted ? variant.discountPrice : variant.price)}</span>${discounted ? `<span class="price-old">${money(variant.price)}</span>` : ""}`;
    document.getElementById("pd-stock").textContent = variant.stock <= 5 ? "Only " + variant.stock + " left" : variant.stock + " available";
    document.getElementById("pd-variant-info").textContent = variantLabel(variant);
    const images = (variant.images?.length ? variant.images : product.images || []).map(resolveImage).filter(Boolean);
    if (images.length) document.getElementById("main-product-image").src = images[0];
    const thumbnails = document.querySelector(".pd-thumbnails");
    if (thumbnails) { thumbnails.innerHTML = images.map((url) => `<button type="button" data-image="${escapeHtml(url)}"><img src="${escapeHtml(url)}" alt="" /></button>`).join(""); thumbnails.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { document.getElementById("main-product-image").src = button.dataset.image; })); }
  };
  select.addEventListener("change", update);
  const selected = new URLSearchParams(window.location.search).get("variantId");
  if (product.variants.some((v) => v._id === selected && v.stock > 0)) select.value = selected;
  update();
}

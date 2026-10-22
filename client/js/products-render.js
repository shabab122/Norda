function productCardHtml(product) {
  const discounted =
    product.discountPrice > 0 && Number(product.discountPrice) < Number(product.price);
  const displayedPrice = discounted ? product.discountPrice : product.price;
  const category = product.category?.name || "Everyday";
  const brand = product.brandRef?.name || product.brand || "Norda selection";
  const imageUrl = resolveImage(product.images?.[0] || "/assets/products/collection.svg");
  const initials = product.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  let stock = `<span class="stock-ready">In stock</span>`;
  if (product.stock === 0) stock = `<span class="stock-out">Out of stock</span>`;
  else if (product.stock <= 5) {
    stock = `<span class="stock-low">Only ${product.stock} left</span>`;
  }

  return `
    <article class="product-card">
      <a class="product-thumb" href="product-detail.html?id=${encodeURIComponent(product._id)}" aria-label="View ${escapeHtml(product.name)}">
        ${discounted ? `<span class="tag">Save ${Math.round((1 - product.discountPrice / product.price) * 100)}%</span>` : ""}
        ${
          imageUrl
            ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" />`
            : `<div class="product-fallback"><span>${escapeHtml(initials)}</span><small>${escapeHtml(category)}</small></div>`
        }
      </a>
      <button type="button" class="wishlist-toggle" data-wishlist="${escapeHtml(product._id)}" aria-label="Save ${escapeHtml(product.name)} to wishlist" aria-pressed="false"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.5 4.6a5.5 5.5 0 0 0-7.8 0L12 5.3l-.7-.7a5.5 5.5 0 0 0-7.8 7.8L12 21l8.5-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></button>
      <div class="product-info">
        <div class="product-eyebrow">
          <span>${escapeHtml(category)}</span>
          <span>${escapeHtml(brand)}</span>
        </div>
        <a class="product-name" href="product-detail.html?id=${encodeURIComponent(product._id)}">${escapeHtml(product.name)}</a>
        <div class="product-price">
          <span class="price-now">${product.hasVariants || product.variants?.length ? "From " : ""}${money(displayedPrice)}</span>
          ${discounted ? `<span class="price-old">${money(product.price)}</span>` : ""}
        </div>
        <div class="product-card-meta">
          <span class="rating">${product.ratingCount ? "★ " + Number(product.ratingAverage).toFixed(1) + " (" + product.ratingCount + ")" : "New arrival"}</span>
          ${stock}
        </div>
        <div class="product-footer"><a href="product-detail.html?id=${encodeURIComponent(product._id)}">View details ↗</a>${product.hasVariants || product.variants?.length ? `<a class="variant-choose" href="product-detail.html?id=${encodeURIComponent(product._id)}">Choose options</a>` : `<button type="button" data-quick-cart="${escapeHtml(product._id)}" ${product.stock === 0 ? "disabled" : ""}>${product.stock === 0 ? "Sold out" : "+ Add to cart"}</button>`}</div>
      </div>
    </article>
  `;
}

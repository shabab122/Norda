let cartLoadSequence = 0;
let cartMutationPending = false;
let cartNotice = null;
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader(); renderFooter();
  if (!requireLogin()) return;
  try { cartNotice = JSON.parse(sessionStorage.getItem("norda_cart_notice") || "null"); sessionStorage.removeItem("norda_cart_notice"); } catch { /* Optional feedback. */ }
  await loadCart();
});
async function loadCart() {
  const sequence = ++cartLoadSequence;
  const root = document.getElementById("cart-root");
  try {
    const [cart, store] = await Promise.all([Api.get("/cart"), getStoreConfig()]);
    if (sequence !== cartLoadSequence) return;
    const notice = cartNotice ? `<div class="alert alert-${cartNotice.type === "success" ? "success" : "warning"}">${escapeHtml(cartNotice.message)}</div>` : "";
    const items = cart.items || [];
    if (!items.length) {
      root.innerHTML = notice + `<div class="empty-state spacious"><span class="empty-kicker">A little room for something good</span><h2>Your cart is waiting.</h2><p>Explore the collection and find your next everyday favourite.</p><a href="products.html" class="btn btn-primary">Explore products ${icon("arrow")}</a></div>`;
      return;
    }
    const subtotal = items.filter((item) => !item.unavailable).reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = subtotal >= store.freeShippingThreshold ? 0 : store.flatShippingFee;
    const blocked = items.some((item) => item.unavailable || item.quantity > item.product.stock);
    root.innerHTML = notice + `<div class="cart-layout"><div class="cart-items">
      <div class="cart-list-heading"><h2>Your selection · ${items.length} item${items.length === 1 ? "" : "s"}</h2><button class="text-button danger-text" type="button" id="clear-cart">Clear cart</button></div>
      ${items.map(cartRow).join("")}</div><aside class="summary-card" aria-label="Order summary">
      <span class="eyebrow">The details</span><h2>Order summary</h2>
      <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div><div class="summary-row"><span>Delivery</span><span>${shipping ? money(shipping) : "Free"}</span></div>
      <p class="shipping-progress">${shipping ? "Add " + money(store.freeShippingThreshold - subtotal) + " for free delivery." : "Your order qualifies for free delivery."}</p>
      <div class="summary-row summary-total"><span>Total</span><span>${money(subtotal + shipping)}</span></div>
      ${blocked ? `<p class="alert alert-warning">Remove unavailable items or update quantities before checkout.</p><button class="btn btn-primary btn-block" disabled>Review your cart</button>` : `<a href="checkout.html" class="btn btn-primary btn-block">Continue to checkout ${icon("arrow")}</a>`}
      <a href="products.html" class="summary-link">Keep exploring</a><p class="summary-note">Prices and availability are checked again when you place your order.</p></aside></div>`;
    bindCart();
  } catch (error) { if (sequence !== cartLoadSequence) return; root.innerHTML = `<div class="empty-state"><h2>Cart unavailable</h2><p>${escapeHtml(error.message)}</p><a class="btn btn-outline" href="cart.html">Try again</a></div>`; }
}
function cartRow(item) {
  if (item.unavailable || !item.product) return `<article class="cart-unavailable" data-item-id="${escapeHtml(item._id)}"><h3>${escapeHtml(item.product?.name || "Unavailable product")}</h3><p>This item is no longer available. Remove it to continue checkout.</p><button class="remove-link" type="button">Remove item</button></article>`;
  const product = item.product;
  const image = resolveImage(product.images?.[0] || "/assets/products/collection.svg");
  return `<article class="cart-row" data-item-id="${escapeHtml(item._id)}" data-stock="${product.stock}">
    <a class="cart-thumb" href="product-detail.html?id=${encodeURIComponent(product._id)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" /></a>
    <div class="cart-product"><a href="product-detail.html?id=${encodeURIComponent(product._id)}">${escapeHtml(product.name)}</a><span>${money(item.price)} each</span>${item.quantity > product.stock ? `<span class="danger-text">Only ${product.stock} available now</span>` : ""}<button class="remove-link" type="button">Remove</button></div>
    <div class="cart-qty"><button class="btn-icon qty-decrease" type="button" aria-label="Decrease quantity" ${item.quantity <= 1 || product.stock === 0 ? "disabled" : ""}>−</button><label class="sr-only" for="qty-${item._id}">Quantity</label><input id="qty-${item._id}" class="qty-value" type="number" min="1" max="${Math.max(product.stock, 1)}" step="1" value="${item.quantity}" ${product.stock === 0 ? "disabled" : ""} /><button class="btn-icon qty-increase" type="button" aria-label="Increase quantity" ${item.quantity >= product.stock ? "disabled" : ""}>+</button></div><strong class="cart-line-total">${money(item.price * item.quantity)}</strong></article>`;
}
function bindCart() {
  document.querySelectorAll("[data-item-id]").forEach((row) => {
    const input = row.querySelector(".qty-value");
    if (input) {
      const maximum = Number(row.dataset.stock);
      const previous = Number(input.value);
      const update = async (value) => {
        if (cartMutationPending) return;
        const quantity = Number(value);
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maximum) { input.value = previous; toast("Choose a whole-number quantity within the available stock.", "error"); return; }
        cartMutationPending = true; row.classList.add("is-updating");
        try { await enqueueCartWrite(() => Api.put("/cart/" + row.dataset.itemId, { quantity })); await loadCart(); refreshCartBadge(); }
        catch (error) { input.value = previous; toast(error.message, "error"); row.classList.remove("is-updating"); }
        finally { cartMutationPending = false; }
      };
      row.querySelector(".qty-decrease").addEventListener("click", () => update(Number(input.value) - 1));
      row.querySelector(".qty-increase").addEventListener("click", () => update(Number(input.value) + 1));
      input.addEventListener("change", () => update(input.value));
    }
    row.querySelector(".remove-link").addEventListener("click", async () => {
      if (cartMutationPending) return;
      cartMutationPending = true;
      row.classList.add("is-updating");
      try { await enqueueCartWrite(() => Api.del("/cart/" + row.dataset.itemId)); await loadCart(); refreshCartBadge(); }
      catch (error) { toast(error.message, "error"); row.classList.remove("is-updating"); }
      finally { cartMutationPending = false; }
    });
  });
  document.getElementById("clear-cart").addEventListener("click", async (event) => {
    if (cartMutationPending || !confirm("Remove every item from your cart?")) return;
    cartMutationPending = true;
    const button = event.currentTarget; button.disabled = true;
    try { await enqueueCartWrite(() => Api.del("/cart")); await loadCart(); refreshCartBadge(); }
    catch (error) { toast(error.message, "error"); button.disabled = false; }
    finally { cartMutationPending = false; }
  });
}

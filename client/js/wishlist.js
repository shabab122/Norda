let wishlistPage = 1;
let wishlistRead = 0;
let wishlistOwner;
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready; renderHeader("wishlist"); renderFooter();
  if (!requireLogin()) return;
  wishlistOwner = Api.getUser()._id;
  const params = new URLSearchParams(location.search), pending = params.get("add");
  if (pending) {
    params.delete("add"); history.replaceState(null, "", "wishlist.html" + (params.size ? "?" + params : ""));
    if (/^[a-f\d]{24}$/i.test(pending)) try { await Api.put("/wishlist/" + pending, {}); } catch (error) { toast(error.message, "error"); }
  }
  await loadWishlist();
});
async function loadWishlist() {
  const read = ++wishlistRead, root = document.getElementById("tools-root");
  try {
    const data = await Api.get("/wishlist?page=" + wishlistPage + "&limit=12");
    if (read !== wishlistRead || Api.getUser()?._id !== wishlistOwner) return;
    if (wishlistPage > data.pages) { wishlistPage = data.pages; return loadWishlist(); }
    root.innerHTML = data.items.length ? `<div class="tools-intro"><p>${data.total} saved product${data.total === 1 ? "" : "s"}. Prices and availability stay up to date.</p><a href="products.html" class="text-link">Continue shopping →</a></div><div class="product-grid">${data.items.map((item) => `<div class="wishlist-item">${item.product && !item.unavailable ? productCardHtml(item.product) : `<article class="tool-card"><h2>${escapeHtml(item.product?.name || "Unavailable product")}</h2><p>This product is no longer available to buy.</p></article>`}<button type="button" class="text-button wishlist-remove" data-remove-saved="${escapeHtml(item._id)}">Remove from wishlist</button></div>`).join("")}</div><nav class="tools-pager" aria-label="Wishlist pages"><button class="btn btn-outline btn-sm" id="wish-prev" ${data.page <= 1 ? "disabled" : ""}>Previous</button><span>Page ${data.page} of ${data.pages}</span><button class="btn btn-outline btn-sm" id="wish-next" ${data.page >= data.pages ? "disabled" : ""}>Next</button></nav>` : `<div class="empty-state spacious"><h2>Your favourites belong here</h2><p>Save a product with its heart button and come back whenever you are ready.</p><a href="products.html" class="btn btn-primary">Explore the shop</a></div>`;
    document.getElementById("wish-prev")?.addEventListener("click", () => { wishlistPage--; loadWishlist(); });
    document.getElementById("wish-next")?.addEventListener("click", () => { wishlistPage++; loadWishlist(); });
    root.querySelectorAll("[data-remove-saved]").forEach((button) => button.addEventListener("click", async () => {
      if (button.disabled) return; button.disabled = true;
      try { await Api.del("/wishlist/entries/" + button.dataset.removeSaved); if (Api.getUser()?._id !== wishlistOwner) return; await loadWishlist(); await refreshWishlistButtons(true); }
      catch (error) { toast(error.message, "error"); button.disabled = false; }
    }));
    await refreshWishlistButtons(true);
  } catch (error) { if (read === wishlistRead && Api.getUser()?._id === wishlistOwner) root.innerHTML = `<div class="empty-state"><h2>Wishlist unavailable</h2><p>${escapeHtml(error.message)}</p></div>`; }
}
window.addEventListener("norda:wishlist-changed", () => { if (wishlistOwner === Api.getUser()?._id) loadWishlist(); });

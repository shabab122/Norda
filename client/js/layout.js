let currentPage = "";
let passwordControlSequence = 0, passwordControlsReady = false;
const passwordControls = new Set();
function enhancePasswordInputs(root = document) {
  const inputs = [...(root.querySelectorAll?.('input[type="password"]') || [])];
  if (root.matches?.('input[type="password"]')) inputs.unshift(root);
  for (const input of inputs) {
    if (input.tagName !== "INPUT" || input.type !== "password" || input.dataset.passwordVisibility || !input.parentNode) continue;
    input.dataset.passwordVisibility = "true";
    if (!input.id) input.id = "norda-password-" + (++passwordControlSequence);
    const wrapper = document.createElement("div"), button = document.createElement("button");
    wrapper.className = "password-field"; button.className = "password-toggle"; button.type = "button";
    button.setAttribute("aria-controls", input.id);
    const setVisible = visible => {
      input.type = visible ? "text" : "password";
      button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
      button.setAttribute("aria-pressed", String(visible)); button.title = visible ? "Hide password" : "Show password";
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>' + (visible ? '<path d="m3 3 18 18"/>' : '') + '</svg>';
    };
    input.parentNode.insertBefore(wrapper, input); wrapper.appendChild(input); wrapper.appendChild(button);
    button.addEventListener("click", event => { event.preventDefault(); setVisible(input.type === "password"); });
    input.closest?.("form")?.addEventListener("reset", () => setVisible(false));
    passwordControls.add({ input, hide: () => setVisible(false) }); setVisible(false);
  }
}
function enablePasswordVisibility() {
  if (passwordControlsReady) return;
  passwordControlsReady = true; enhancePasswordInputs();
  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) enhancePasswordInputs(node);
      for (const control of passwordControls) if (!control.input.isConnected) passwordControls.delete(control);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  const hideAll = () => { for (const control of passwordControls) control.hide(); };
  window.addEventListener("pagehide", hideAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) hideAll(); });
}
document.addEventListener("DOMContentLoaded", enablePasswordVisibility);
function isGuestOrderView() {
  const page = (window.location?.pathname || "").split("/").pop();
  return ["invoice.html", "order-tracking.html"].includes(page) && new URLSearchParams(window.location?.search || "").get("guest") === "1";
}
function shoppingIdentity() { return isGuestOrderView() ? (typeof Guest !== "undefined" ? Guest.current?.id : null) : Api.getUser()?._id || (typeof Guest !== "undefined" ? Guest.current?.id : null); }
function orderHistoryUrl() { return isGuestOrderView() || !Api.getUser() ? "guest-orders.html" : "orders.html"; }
function orderProgressHtml(status) {
  if (status === "cancelled") return '<p class="order-progress-cancelled">This order was cancelled. Refund updates remain separate.</p>';
  const steps = [["pending", "Order placed"], ["processing", "Preparing"], ["shipped", "Shipped"], ["delivered", "Delivered"]], current = steps.findIndex(([key]) => key === status);
  return '<ol class="order-progress" aria-label="Order progress">' + steps.map(([key, label], index) => `<li class="${index < current ? "is-complete" : index === current ? "is-current" : ""}"${index === current ? ' aria-current="step"' : ''}><span aria-hidden="true">${index + 1}</span><strong>${label}</strong>${index < current ? '<small>Completed</small>' : index === current ? '<small>Current stage</small>' : ''}</li>`).join("") + '</ol>';
}
function requireShopper() { if (shoppingIdentity()) { if (document.body) document.body.dataset.protected = "shopper"; return true; } window.location.href = "guest-orders.html"; return false; }
function renderHeader(activePage = "") {
  currentPage = activePage;
  enableSkipLink();
  const user = Api.getUser();
  const header = document.getElementById("site-header");
  if (!header) return;

  header.innerHTML = `
    <div class="announcement-bar">
      <div class="container announcement-inner">
        <span id="announcement-delivery">Delivery across Bangladesh</span>
        <span id="store-announcement">Secure checkout · Honest pricing</span>
      </div>
    </div>
    <div class="site-header">
      <div class="header-inner container">
        ${brandLogoHtml()}
        <button class="mobile-toggle" id="mobile-toggle" type="button" aria-controls="header-menu" aria-expanded="false">
          <span></span><span></span><span></span><span class="sr-only">Open menu</span>
        </button>
        <div class="header-menu" id="header-menu">
          <nav class="main-nav" aria-label="Primary navigation">
            <a href="index.html" class="${activePage === "home" ? "active" : ""}">Home</a>
            <a href="products.html" class="${activePage === "products" ? "active" : ""}">Shop</a>
            <a href="coupons.html" class="${activePage === "coupons" ? "active" : ""}">Offers</a>
            <a href="wishlist.html" class="${activePage === "wishlist" ? "active" : ""}">Wishlist</a>
            ${user ? `<a href="orders.html" class="${activePage === "orders" ? "active" : ""}">Orders</a>` : ""}
            ${user && user.role !== "admin" ? `<a href="${accountHome(user)}" class="${activePage === "dashboard" ? "active" : ""}">My account</a>` : ""}
            ${!user ? `<a href="register.html">Create account</a>` : ""}
            ${!user || (typeof Guest !== "undefined" && Guest.current) ? `<a href="guest-orders.html">Track order</a>` : ""}
          </nav>
          <form class="search-form" id="global-search-form" role="search">
            <label class="sr-only" for="global-search">Search products, categories or brands</label>
            <input type="search" id="global-search" name="q" placeholder="Products, categories or brands" autocomplete="off" maxlength="80" />
            <button type="submit" id="global-search-submit" disabled>Search</button>
          </form>
        </div>
        <div class="header-actions ${user ? "has-account" : ""}">
          ${user ? `<a href="${accountHome(user)}" class="account-link ${user.role === "admin" ? "account-link-admin" : ""}" title="${escapeHtml(user.name + " · " + user.email)}" aria-label="${escapeHtml((user.role === "admin" ? "Administrator" : "Customer") + " account: " + user.name + ", " + user.email)}"><span class="account-avatar" aria-hidden="true">${escapeHtml(accountInitials(user.name))}</span><span class="account-link-copy"><strong>${escapeHtml(user.name)}</strong><small>${user.role === "admin" ? "Admin workspace" : user.role === "staff" ? "Staff workspace" : "Customer account"}</small></span></a>` : ""}
          <a href="cart.html" class="icon-link cart-link">
            ${icon("bag")}<span>Cart</span><span id="cart-count" class="badge hidden">0</span>
          </a>
          ${
            user
              ? `<button type="button" id="logout-link" class="text-button logout-button">${icon("logout")}<span>Sign out</span></button>`
              : `<a href="login.html" class="icon-link">${icon("user")}<span>Sign in</span></a>`
          }
        </div>
      </div>
    </div>
  `;

  const searchForm = document.getElementById("global-search-form");
  const searchInput = document.getElementById("global-search");
  const keyword = new URLSearchParams(window.location.search).get("keyword");
  if (keyword && searchInput) searchInput.value = keyword;
  const searchButton = document.getElementById("global-search-submit");
  const syncSearch = () => { if (searchButton) searchButton.disabled = !searchInput?.value.trim(); };
  searchInput?.addEventListener("input", syncSearch);
  searchInput?.addEventListener("search", syncSearch);
  syncSearch();
  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (!query) { syncSearch(); return; }
    window.location.href = "products.html?keyword=" + encodeURIComponent(query);
  });

  const toggle = document.getElementById("mobile-toggle");
  const menu = document.getElementById("header-menu");
  toggle?.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  document.getElementById("logout-link")?.addEventListener("click", async () => {
    try { await Api.post("/auth/logout"); Api.logout(); window.location.href = "index.html"; }
    catch (error) { toast(error.message, "error"); }
  });

  refreshCartBadge();
  loadAnnouncement();
}

function renderFooter() {
  const footer = document.getElementById("site-footer");
  if (!footer) return;
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          ${brandLogoHtml()}
          <p>Useful things, thoughtfully selected for everyday life in Bangladesh.</p>
        </div>
        <div>
          <h4>Shop</h4>
          <ul>
            <li><a href="products.html">All products</a></li>
            <li><a href="products.html?featured=true">Featured picks</a></li>
            <li><a href="cart.html">Cart</a></li>
          </ul>
        </div>
        <div>
          <h4>Account</h4>
          <ul>
            <li><a href="${Api.getUser() ? accountHome() : "login.html"}">${Api.getUser() ? "My dashboard" : "Sign in or create account"}</a></li>
            <li><a href="profile.html">Profile</a></li><li><a href="stock-alerts.html">Availability alerts</a></li><li><a href="guest-orders.html">Guest orders & access</a></li>
            <li><a href="orders.html">Orders & invoices</a></li>
            ${!Api.getUser() ? `<li><a href="register.html">Create account</a></li>` : ""}
          </ul>
        </div>
        <div>
          <h4>Store</h4>
          <ul>
            <li id="store-contact-address">Dhaka, Bangladesh</li>
            <li id="store-contact-email" hidden></li>
            <li id="store-contact-phone" hidden></li>
            <li><a href="help.html">Contact & help</a></li>
            <li><a href="help.html#delivery">Delivery & returns</a></li>
            <li><a href="help.html#privacy">Privacy & terms</a></li>
            <li><a href="login.html?next=admin%2Forders.html">Store staff sign in</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${new Date().getFullYear()} Norda</span>
        <span>Built for clear, dependable shopping.</span>
      </div>
    </div>
  `;
  loadStoreFooter();
}

function accountHome(user = Api.getUser()) {
  if (user?.staffMfaRequired && !user.mfaEnabled) return "authenticator.html";
  return user?.role === "admin" ? "admin/dashboard.html" : user?.role === "staff" ? "admin/workspace.html" : "dashboard.html";
}
function accountInitials(name) {
  return String(name || "Customer").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase();
}

async function refreshCartBadge() {
  const badge = document.getElementById("cart-count");
  if (!badge || !shoppingIdentity()) {
    badge?.classList.add("hidden");
    return;
  }
  try {
    const cart = await Api.get("/cart");
    const count = (cart.items || []).filter((item) => !item.unavailable).reduce((sum, item) => sum + item.quantity, 0);
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.classList.toggle("hidden", count === 0);
  } catch {
    badge.classList.add("hidden");
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function resolveImage(value) {
  if (typeof value !== "string" || !value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (!/^\/(?:uploads|assets)\/[a-zA-Z0-9_./-]+$/.test(value) || value.includes("..")) return "";
  const serverBase = API_BASE_URL.replace(/\/api\/?$/, "");
  return serverBase + (value.startsWith("/") ? value : "/" + value);
}

function requireLogin(redirectTo = "login.html") {
  document.body.dataset.protected = "customer";
  if (Api.isLoggedIn()) return true;
  const current = window.location.pathname.split("/").pop() + window.location.search;
  window.location.href = redirectTo + "?next=" + encodeURIComponent(current);
  return false;
}

function requireAdmin() {
  if (Api.getUser()?.staffMfaRequired && !Api.getUser()?.mfaEnabled) { window.location.href = "../authenticator.html"; return false; }
  document.body.dataset.protected = "admin";
  if (Api.isAdmin()) return true;
  if (Api.getUser()?.role === "staff") {
    const page = window.location.pathname.split("/").pop();
    const scopes = { "logistics-automation.html": "orders", "statement-sync.html": "payments", "routing-bulk.html": "inventory", "whole-return-receipts.html": "payments", "settlements.html": "payments", "fulfillment.html": "orders", "return-pickups.html": "orders", "exchange-payments.html": "payments", "advanced-inventory.html": "inventory", "courier.html": "orders", "media.html": "catalog", "dashboard.html": "reports", "reports.html": "reports", "products.html": "catalog", "categories.html": "catalog", "brands.html": "catalog", "inventory.html": "inventory", "coupons.html": "marketing", "store-settings.html": "settings", "orders.html": "orders", "shipments.html": "orders", "invoices.html": "orders", "operations.html": "payments", "item-returns.html": "payments", "notifications.html": "notifications", "customers.html": "customers" };
    if (((page === "advanced-inventory.html" && Api.can("catalog")) || (page === "fulfillment.html" && Api.can("inventory"))) || page === "workspace.html" || (scopes[page] && Api.can(scopes[page]))) return true;
    window.location.href = "workspace.html"; return false;
  }
  window.location.href = "../login.html";
  return false;
}

// A visitor may choose an item before signing in. Keep one short-lived intent,
// not a guest cart; apply it once after successful login/registration.
function rememberCartIntent(productId, quantity, variantId) {
  try { sessionStorage.setItem("norda_pending_cart", JSON.stringify({ productId, quantity, ...(variantId ? { variantId } : {}), createdAt: Date.now() })); } catch { /* Sign in and add again if browser storage is disabled. */ }
}
function takeCartIntent() {
  try {
    const value = JSON.parse(sessionStorage.getItem("norda_pending_cart") || "null");
    sessionStorage.removeItem("norda_pending_cart");
    if (!value || !/^[a-f0-9]{24}$/i.test(value.productId) || !Number.isSafeInteger(value.quantity) || value.quantity < 1 || !Number.isFinite(value.createdAt) || Date.now() - value.createdAt < 0 || Date.now() - value.createdAt > 15 * 60 * 1000) return null;
    if (value.variantId !== undefined && !/^[a-f0-9]{24}$/i.test(value.variantId)) return null;
    return value;
  } catch { return null; }
}
let cartWriteQueue = Promise.resolve();
function enqueueCartWrite(work) {
  const userId = shoppingIdentity();
  const next = cartWriteQueue.then(() => {
    if (!userId || userId !== shoppingIdentity()) throw new Error("Your account changed. Please refresh before updating your cart.");
    return work();
  });
  cartWriteQueue = next.catch(() => {});
  return next;
}
async function addProductToCart(productId, quantity = 1, variantId) {
  if (variantId !== undefined && !/^[a-f0-9]{24}$/i.test(variantId)) throw new Error("Choose a valid product option.");
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Choose a positive whole-number quantity.");
  if (!Api.isLoggedIn() && typeof Guest !== "undefined") await Guest.ensure();
  if (!Api.isLoggedIn() && !shoppingIdentity()) { rememberCartIntent(productId, quantity, variantId); requireLogin(); return false; }
  await enqueueCartWrite(() => Api.post("/cart", { productId, quantity, ...(variantId ? { variantId } : {}) }));
  return true;
}
async function finishCartIntent() {
  const pending = takeCartIntent();
  if (!pending) return false;
  let message = "Your selected product was added to your cart."; let type = "success";
  try { await addProductToCart(pending.productId, pending.quantity, pending.variantId); }
  catch (error) { message = error.message + " Review your cart before adding the item again."; type = "warning"; }
  try { sessionStorage.setItem("norda_cart_notice", JSON.stringify({ message, type })); } catch { /* Optional feedback. */ }
  return true;
}

function money(value) {
  const amount = Number(value);
  return "৳" + (Number.isFinite(amount) ? amount : 0).toLocaleString("en-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDate(value, includeTime = false) {
  const options = includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" };
  return new Intl.DateTimeFormat("en-BD", options).format(new Date(value));
}

function paymentLabel(value) {
  return {
    pending: "Payment pending",
    paid: "Paid",
    failed: "Payment failed",
    cancelled: "Payment cancelled",
    review: "Payment needs review",
  }[value] || value;
}


const iconPaths = {
  bag: '<path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  logout: '<path d="M9 5H4v14h5M13 8l4 4-4 4M8 12h13"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  box: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5m-9 5v8m-4.5-15 9 5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  sliders: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="17" r="2" fill="currentColor"/>',
};
function icon(name) { return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.box}</svg>`; }

let storeConfigPromise;
function getStoreConfig() { return storeConfigPromise ||= Api.get("/store/config").catch((error) => { storeConfigPromise = null; throw error; }); }
async function loadAnnouncement() {
  try {
    const store = await getStoreConfig();
    const element = document.getElementById("announcement-delivery");
    if (element) element.textContent = "Free delivery from " + money(store.freeShippingThreshold);
    const banner = document.getElementById("store-announcement");
    if (banner && store.announcement?.visible) {
      banner.textContent = store.announcement.text;
      const url = safeStoreLink(store.announcement.url);
      if (url) { const link = document.createElement("a"); link.href = url; link.textContent = store.announcement.text; banner.replaceChildren(link); }
    }
  } catch { /* Delivery remains described without an incorrect price promise. */ }
}
function toast(message, type = "success") {
  let root = document.getElementById("toast-region");
  if (!root) { root = document.createElement("div"); root.id = "toast-region"; root.className = "toast-region"; root.setAttribute("aria-live", "polite"); document.body.appendChild(root); }
  const item = document.createElement("div"); item.className = "toast toast-" + type; item.textContent = message; root.appendChild(item);
  setTimeout(() => item.remove(), 5000);
}
function openDialog(id) {
  const modal = document.getElementById(id); modal.classList.remove("hidden");
  modal._returnFocus = document.activeElement;
  document.body.classList.add("modal-open");
  const focusable = () => [...modal.querySelectorAll('button:not([disabled]), input:not([type="hidden"]), select, textarea, a[href]')].filter((element) => element.offsetParent !== null);
  modal._keyboard = (event) => {
    if (event.key === "Escape") { closeDialog(id); return; }
    if (event.key !== "Tab") return;
    const nodes = focusable(); const first = nodes[0]; const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  modal.addEventListener("keydown", modal._keyboard); focusable()[0]?.focus();
}
function closeDialog(id) {
  const modal = document.getElementById(id);
  if (modal.dataset.busy === "true") return; modal.classList.add("hidden");
  modal.removeEventListener("keydown", modal._keyboard); document.body.classList.remove("modal-open"); modal._returnFocus?.focus();
}
window.addEventListener("norda:guest-expired", () => {
  if (document.body?.dataset.protected === "shopper" && !Api.isLoggedIn()) {
    window.location.replace("guest-orders.html");
  } else if (document.getElementById("site-header")) renderHeader(currentPage);
});
window.addEventListener("norda:session-expired", () => {
  if (document.body?.dataset.protected) {
    const admin = document.body.dataset.protected === "admin";
    const next = window.location.pathname.split("/").pop() + window.location.search;
    window.location.replace((admin ? "../" : "") + "login.html?next=" + encodeURIComponent(next));
  } else if (document.getElementById("site-header")) renderHeader(currentPage);
});
// Cookies/localStorage are shared between tabs. Refresh the visible identity
// immediately when another tab changes accounts instead of showing stale data.
window.addEventListener("storage", (event) => {
  if (event.storageArea && event.storageArea !== window.localStorage) return;
  if (!["norda_user", "norda_token", null].includes(event.key) || (event.key !== null && event.oldValue === event.newValue)) return;
  Api.currentUser = null;
  try { sessionStorage.removeItem("norda_checkout"); sessionStorage.removeItem("norda_pending_cart"); sessionStorage.removeItem("norda_cart_notice"); } catch { /* Optional browser storage. */ }
  document.body?.setAttribute("data-account-changing", "true");
  window.location.reload();
});
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  document.body?.setAttribute("data-account-changing", "true");
  window.location.reload();
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-quick-cart]"); if (!button || button.disabled) return;
  const label = button.innerHTML; button.disabled = true; button.textContent = "Adding…";
  try { if (await addProductToCart(button.dataset.quickCart, 1)) { toast("Added to your cart"); refreshCartBadge(); } }
  catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; button.innerHTML = label; }
});
document.addEventListener("error", (event) => {
  const image = event.target;
  if (image.tagName !== "IMG" || image.dataset.fallbackUsed) return;
  image.dataset.fallbackUsed = "true";
  image.src = resolveImage("/assets/products/collection.svg");
}, true);

function enableSkipLink() {
  const main = document.querySelector("main");
  if (!main || document.getElementById("skip-link")) return;
  main.id ||= "main-content";
  const link = document.createElement("a"); link.id = "skip-link"; link.className = "skip-link"; link.href = "#" + main.id; link.textContent = "Skip to content"; document.body.prepend(link);
}

function paymentMethodLabel(order) {
  if (order.paymentMethod === "demo") return (order.paymentChannel === "mobile_banking" ? "Mobile Banking / bKash" : "Card / Bank");
  return order.paymentMethod === "sslcommerz" ? "SSLCOMMERZ" : "Cash on delivery";
}

function brandLogoHtml(prefix = "", extraClass = "", caption = "") {
  return `<a href="${escapeHtml(prefix)}index.html" class="logo brand-logo ${escapeHtml(extraClass)}" aria-label="Norda home"><img class="brand-mark" src="${escapeHtml(prefix)}assets/brand/norda-mark.webp" width="40" height="44" alt="" /><strong class="brand-name">Norda</strong>${caption ? `<small class="brand-caption">${escapeHtml(caption)}</small>` : ""}</a>`;
}

function paymentNote(value) {
  return String(value || "").replace(/^Demo payment failed; no money was charged$/, "Payment failed; no money was charged")
    .replace(/^Demo checkout cancelled; no money was charged$/, "Checkout cancelled; no money was charged");
}

function variantLabel(item) { return [item.size, item.color, item.sku ? "SKU: " + item.sku : ""].filter(Boolean).join(" · "); }

function safeStoreLink(value) {
  if (typeof value !== "string" || /[\\\s<>"']/.test(value)) return "";
  if (value.startsWith("/") && !value.startsWith("//") && !/%(?:2f|5c)/i.test(value)) return value;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}
async function loadStoreFooter() {
  try {
    const store = await getStoreConfig();
    const address = document.getElementById("store-contact-address"); if (address) address.textContent = store.address || "Dhaka, Bangladesh";
    for (const [id, value] of [["store-contact-email", store.supportEmail], ["store-contact-phone", store.supportPhone]]) {
      const row = document.getElementById(id); if (!row) continue; row.hidden = !value; row.textContent = value || "";
    }
  } catch { /* The existing footer remains usable while content is unavailable. */ }
}
function applyStoreHero(hero) {
  const section = document.getElementById("home-hero"); if (!section || !hero) return;
  section.hidden = hero.visible === false;
  for (const [id, key] of [["home-hero-eyebrow", "eyebrow"], ["hero-title", "title"], ["home-hero-description", "description"]]) {
    const element = document.getElementById(id); if (element && typeof hero[key] === "string") element.textContent = hero[key];
  }
  const button = document.getElementById("home-hero-button"), link = safeStoreLink(hero.buttonUrl);
  if (button && link) { button.href = link; button.textContent = hero.buttonLabel; }
  const image = document.getElementById("home-hero-image"); if (image && hero.imageUrl) image.src = resolveImage(hero.imageUrl);
}

let savedWishlistIds = new Set(), savedWishlistOwner, wishlistIdsPromise, wishlistRequestedOwner, wishlistReadVersion = 0;
function syncWishlistButtons() {
  document.querySelectorAll("[data-wishlist]").forEach((button) => {
    const saved = savedWishlistOwner === Api.getUser()?._id && savedWishlistIds.has(button.dataset.wishlist);
    button.setAttribute("aria-pressed", String(Boolean(saved)));
    button.setAttribute("aria-label", saved ? "Remove product from wishlist" : "Save product to wishlist");
    if (!button.classList.contains("wishlist-toggle")) button.textContent = saved ? "Saved to wishlist" : "Save to wishlist";
  });
}
async function refreshWishlistButtons(force = false) {
  const owner = Api.getUser()?._id;
  if (!owner) { savedWishlistIds.clear(); savedWishlistOwner = undefined; syncWishlistButtons(); return; }
  if (force || (savedWishlistOwner !== owner && wishlistRequestedOwner !== owner)) {
    const version = ++wishlistReadVersion; wishlistRequestedOwner = owner;
    const work = Api.get("/wishlist/ids").then((ids) => { if (Api.getUser()?._id !== owner || version !== wishlistReadVersion) return; savedWishlistIds = new Set(ids); savedWishlistOwner = owner; }).catch((error) => { if (version === wishlistReadVersion) wishlistRequestedOwner = undefined; throw error; });
    wishlistIdsPromise = work;
  }
  try { await wishlistIdsPromise; if (Api.getUser()?._id === owner) syncWishlistButtons(); } catch { /* A deliberate save still reports its own request result. */ }
}
document.addEventListener("DOMContentLoaded", async () => { await Api.ready; refreshWishlistButtons(); });
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-wishlist]"); if (!button || button.disabled) return;
  const id = button.dataset.wishlist; if (!/^[a-f\d]{24}$/i.test(id)) return;
  if (!Api.isLoggedIn()) { location.href = "login.html?next=" + encodeURIComponent("wishlist.html?add=" + id); return; }
  const owner = Api.getUser()._id; button.disabled = true;
  try {
    await refreshWishlistButtons(); if (Api.getUser()?._id !== owner) return;
    const saved = savedWishlistIds.has(id);
    await (saved ? Api.del("/wishlist/" + id) : Api.put("/wishlist/" + id, {}));
    if (Api.getUser()?._id !== owner) return;
    wishlistReadVersion++;
    if (saved) savedWishlistIds.delete(id); else savedWishlistIds.add(id);
    savedWishlistOwner = owner; syncWishlistButtons(); toast(saved ? "Removed from your wishlist" : "Saved to your wishlist");
    window.dispatchEvent(new CustomEvent("norda:wishlist-changed"));
  } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; }
});

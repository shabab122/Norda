let currentPage = "";
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
        <span>Secure checkout · Honest pricing</span>
      </div>
    </div>
    <div class="site-header">
      <div class="header-inner container">
        <a href="index.html" class="logo" aria-label="Norda home">norda<span>.</span></a>
        <button class="mobile-toggle" id="mobile-toggle" type="button" aria-controls="header-menu" aria-expanded="false">
          <span></span><span></span><span></span><span class="sr-only">Open menu</span>
        </button>
        <div class="header-menu" id="header-menu">
          <nav class="main-nav" aria-label="Primary navigation">
            <a href="index.html" class="${activePage === "home" ? "active" : ""}">Home</a>
            <a href="products.html" class="${activePage === "products" ? "active" : ""}">Shop</a>
            ${user ? `<a href="orders.html" class="${activePage === "orders" ? "active" : ""}">Orders</a>` : ""}
            ${user ? `<a href="profile.html" class="${activePage === "profile" ? "active" : ""}">Profile</a>` : ""}
            ${user?.role === "admin" ? `<a href="admin/dashboard.html">Admin</a>` : ""}
          </nav>
          <form class="search-form" id="global-search-form" role="search">
            <label class="sr-only" for="global-search">Search products</label>
            <input type="search" id="global-search" name="q" placeholder="Search products or brands" autocomplete="off" />
            <button type="submit">Search</button>
          </form>
        </div>
        <div class="header-actions">
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
  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    window.location.href = "products.html" + (query ? "?keyword=" + encodeURIComponent(query) : "");
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
          <a href="index.html" class="logo">norda<span>.</span></a>
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
            <li><a href="profile.html">Profile</a></li>
            <li><a href="orders.html">Orders & invoices</a></li>
            <li><a href="login.html">Sign in</a></li>
          </ul>
        </div>
        <div>
          <h4>Store</h4>
          <ul>
            <li>Dhaka, Bangladesh</li>
            <li>Secure online payment</li>
            <li>Cash on delivery available</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${new Date().getFullYear()} Norda</span>
        <span>Built for clear, dependable shopping.</span>
      </div>
    </div>
  `;
}

async function refreshCartBadge() {
  const badge = document.getElementById("cart-count");
  if (!badge || !Api.isLoggedIn()) {
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
  document.body.dataset.protected = "admin";
  if (Api.isAdmin()) return true;
  window.location.href = "../login.html";
  return false;
}

// A visitor may choose an item before signing in. Keep one short-lived intent,
// not a guest cart; apply it once after successful login/registration.
function rememberCartIntent(productId, quantity) {
  try { sessionStorage.setItem("norda_pending_cart", JSON.stringify({ productId, quantity, createdAt: Date.now() })); } catch { /* Sign in and add again if browser storage is disabled. */ }
}
function takeCartIntent() {
  try {
    const value = JSON.parse(sessionStorage.getItem("norda_pending_cart") || "null");
    sessionStorage.removeItem("norda_pending_cart");
    if (!value || !/^[a-f0-9]{24}$/i.test(value.productId) || !Number.isSafeInteger(value.quantity) || value.quantity < 1 || !Number.isFinite(value.createdAt) || Date.now() - value.createdAt < 0 || Date.now() - value.createdAt > 15 * 60 * 1000) return null;
    return value;
  } catch { return null; }
}
let cartWriteQueue = Promise.resolve();
function enqueueCartWrite(work) {
  const userId = Api.getUser()?._id;
  const next = cartWriteQueue.then(() => {
    if (!userId || userId !== Api.getUser()?._id) throw new Error("Your account changed. Please refresh before updating your cart.");
    return work();
  });
  cartWriteQueue = next.catch(() => {});
  return next;
}
async function addProductToCart(productId, quantity = 1) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Choose a positive whole-number quantity.");
  if (!Api.isLoggedIn()) { rememberCartIntent(productId, quantity); requireLogin(); return false; }
  await enqueueCartWrite(() => Api.post("/cart", { productId, quantity }));
  return true;
}
async function finishCartIntent() {
  const pending = takeCartIntent();
  if (!pending) return false;
  let message = "Your selected product was added to your cart."; let type = "success";
  try { await addProductToCart(pending.productId, pending.quantity); }
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
window.addEventListener("norda:session-expired", () => {
  if (document.body?.dataset.protected) {
    const admin = document.body.dataset.protected === "admin";
    const next = window.location.pathname.split("/").pop() + window.location.search;
    window.location.replace((admin ? "../" : "") + "login.html?next=" + encodeURIComponent(next));
  } else if (document.getElementById("site-header")) renderHeader(currentPage);
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

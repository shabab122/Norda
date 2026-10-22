function renderAdminShell(activePage) {
  enableSkipLink();
  const bar = document.getElementById("admin-topbar-user");
  const user = Api.getUser();

  document.getElementById("admin-sidebar").innerHTML = `
    ${brandLogoHtml("../", "admin-logo", "Admin")}
    <nav aria-label="Admin navigation">
      <span class="admin-nav-label">Workspace</span>
      <a href="dashboard.html" class="${activePage === "dashboard" ? "active" : ""}">${icon("grid")} Overview</a>
      <a href="products.html" class="${activePage === "products" ? "active" : ""}">${icon("box")} Products</a>
      <a href="inventory.html" class="${activePage === "inventory" ? "active" : ""}">${icon("box")} Inventory tools</a>
      <a href="coupons.html" class="${activePage === "coupons" ? "active" : ""}">${icon("bag")} Coupon center</a>
      <a href="store-settings.html" class="${activePage === "store-settings" ? "active" : ""}">${icon("sliders")} Store settings</a>
      <a href="categories.html" class="${activePage === "categories" ? "active" : ""}">${icon("grid")} Categories</a>
      <a href="brands.html" class="${activePage === "brands" ? "active" : ""}">${icon("shield")} Brands</a>
      <a href="orders.html" class="${activePage === "orders" ? "active" : ""}">${icon("bag")} Orders</a>
      <a href="operations.html" class="${activePage === "operations" ? "active" : ""}">${icon("shield")} Requests & payments</a>
      <a href="shipments.html" class="${activePage === "shipments" ? "active" : ""}">${icon("box")} Delivery tracking</a>
      <a href="notifications.html" class="${activePage === "notifications" ? "active" : ""}">${icon("shield")} Email notifications</a>
      <a href="invoices.html" class="${activePage === "invoices" ? "active" : ""}">${icon("box")} Invoices</a>
    </nav>
    <div class="admin-sidebar-foot">
      <a href="../index.html">${icon("arrow")} View storefront</a>
      <a href="#" id="admin-logout">${icon("logout")} Sign out</a>
    </div>
  `;

  if (bar && user) { bar.textContent = user.name + " · Administrator"; bar.title = user.email; }

  document.getElementById("admin-logout").addEventListener("click", async (e) => {
    e.preventDefault();
    try { await Api.post("/auth/logout"); Api.logout(); window.location.href = "../login.html"; }
    catch (error) { toast(error.message, "error"); }
  });
}

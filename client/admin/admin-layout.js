function renderAdminShell(activePage) {
  enableSkipLink();
  const bar = document.getElementById("admin-topbar-user");
  const user = Api.getUser();

  document.getElementById("admin-sidebar").innerHTML = `
    <a href="../index.html" class="logo admin-logo">norda<span>.</span><small>Admin</small></a>
    <nav aria-label="Admin navigation">
      <span class="admin-nav-label">Workspace</span>
      <a href="dashboard.html" class="${activePage === "dashboard" ? "active" : ""}">${icon("grid")} Overview</a>
      <a href="products.html" class="${activePage === "products" ? "active" : ""}">${icon("box")} Products</a>
      <a href="categories.html" class="${activePage === "categories" ? "active" : ""}">${icon("grid")} Categories</a>
      <a href="brands.html" class="${activePage === "brands" ? "active" : ""}">${icon("shield")} Brands</a>
      <a href="orders.html" class="${activePage === "orders" ? "active" : ""}">${icon("bag")} Orders</a>
      <a href="invoices.html" class="${activePage === "invoices" ? "active" : ""}">${icon("box")} Invoices</a>
    </nav>
    <div class="admin-sidebar-foot">
      <a href="../index.html">${icon("arrow")} View storefront</a>
      <a href="#" id="admin-logout">${icon("logout")} Sign out</a>
    </div>
  `;

  if (bar && user) bar.textContent = user.name;

  document.getElementById("admin-logout").addEventListener("click", async (e) => {
    e.preventDefault();
    try { await Api.post("/auth/logout"); Api.logout(); window.location.href = "../login.html"; }
    catch (error) { toast(error.message, "error"); }
  });
}

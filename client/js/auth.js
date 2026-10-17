document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader();
  renderFooter();

  const requestedNext = new URLSearchParams(window.location.search).get("next");
  if (requestedNext) {
    const next = safeNext(requestedNext);
    document.querySelectorAll('.form-foot a').forEach((link) => {
      const page = link.getAttribute("href");
      if (page === "login.html" || page === "register.html") link.href = page + "?next=" + encodeURIComponent(next);
    });
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearAlert();
      const button = e.currentTarget.querySelector('button[type="submit"]');
      if (button.disabled) return;
      button.disabled = true;
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      try {
        const user = await Api.post("/auth/login", { email, password });
        Api.setSession(user, { replaceToken: true });
        const params = new URLSearchParams(window.location.search);
        const next = safeNext(params.get("next"));
        const cartSelected = await finishCartIntent();
        window.location.href = cartSelected ? "cart.html" : user.role === "admin" && !params.get("next") ? "admin/dashboard.html" : next;
      } catch (err) {
        showAlert(err.message, "error");
        button.disabled = false;
      }
    });
  }

  const registerForm = document.getElementById("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearAlert();
      const button = e.currentTarget.querySelector('button[type="submit"]');
      if (button.disabled) return;
      button.disabled = true;
      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      try {
        const user = await Api.post("/auth/register", { name, email, password });
        Api.setSession(user, { replaceToken: true });
        const next = await finishCartIntent() ? "cart.html" : safeNext(new URLSearchParams(window.location.search).get("next"));
        showAlert("Account created. Taking you to Norda…", "success");
        setTimeout(() => (window.location.href = next), 700);
      } catch (err) {
        showAlert(err.message, "error");
        button.disabled = false;
      }
    });
  }
});

function showAlert(message, type) {
  const box = document.getElementById("alert-box");
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
}
function clearAlert() {
  const box = document.getElementById("alert-box");
  if (box) box.innerHTML = "";
}

function safeNext(value) {
  if (!value || value === "login.html" || value === "register.html") return "index.html";
  if (value.startsWith("/") || value.startsWith("\\") || value.includes("://")) return "index.html";
  return /^[a-z0-9-]+\.html(?:\?[a-z0-9%&=_.-]+)?(?:#[a-z0-9_-]+)?$/i.test(value)
    ? value
    : "index.html";
}

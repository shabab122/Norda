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

  let pendingMfaChallenge = null;
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
        const user = pendingMfaChallenge ? await Api.post("/auth/mfa/verify", { challenge: pendingMfaChallenge, code: document.getElementById("login-mfa-code").value.trim() }) : await Api.post("/auth/login", { email, password });
        if (user.mfaRequired) { pendingMfaChallenge = user.challenge; document.getElementById("login-mfa-fields").classList.remove("hidden"); document.getElementById("login-mfa-code").required = true; document.getElementById("email").readOnly = true; document.getElementById("password").readOnly = true; document.getElementById("login-mfa-code").focus(); button.textContent = "Verify & sign in"; button.disabled = false; showAlert("Enter your authenticator code or one unused recovery code. Verification expires in five minutes.", "success"); return; }
        Api.setSession(user, { replaceToken: true });
        if (typeof Guest !== "undefined") await Guest.mergeAfterSignIn();
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next") ? safeNext(params.get("next")) : accountHome(user);
        const cartSelected = await finishCartIntent();
        window.location.href = cartSelected ? "cart.html" : next;
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
        if (typeof Guest !== "undefined") await Guest.mergeAfterSignIn();
        const requested = new URLSearchParams(window.location.search).get("next");
        const next = await finishCartIntent() ? "cart.html" : requested ? safeNext(requested) : accountHome(user);
        showAlert("Account created. You can verify your email from your profile. Taking you to Norda…", "success");
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

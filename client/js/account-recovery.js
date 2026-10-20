document.addEventListener("DOMContentLoaded", async () => {
  // Remove the secret before rendering links or restoring sessions.
  let token = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  await Api.ready;
  renderHeader(); renderFooter();
  const action = document.body.dataset.accountAction;
  const form = document.getElementById("account-form");
  const button = document.getElementById("account-submit");
  if (action !== "forgot" && !/^[a-f\d]{64}$/.test(token)) {
    form.hidden = true;
    accountNotice(action === "reset" ? "This reset link is missing or invalid. Request a new password reset link." : "This verification link is missing or invalid. Request another email from your profile.", true);
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); if (button.disabled) return;
    button.disabled = true;
    const label = button.textContent; button.textContent = "Please wait…";
    try {
      let result;
      if (action === "forgot") result = await Api.post("/auth/forgot-password", { email: document.getElementById("account-email").value.trim() });
      else if (action === "reset") {
        const password = document.getElementById("account-password").value;
        const confirmPassword = document.getElementById("account-confirm-password").value;
        if (password !== confirmPassword) throw new Error("The new passwords do not match.");
        if (new TextEncoder().encode(password).length > 72) throw new Error("Your password must fit within 72 UTF-8 bytes.");
        result = await Api.post("/auth/reset-password", { token, password, confirmPassword });
        Api.logout(); renderHeader();
      } else {
        result = await Api.post("/auth/verify-email", { token });
        await Api.restoreSession(); renderHeader();
      }
      accountNotice(result.message);
      if (action !== "forgot") { token = ""; form.hidden = true; }
      else button.textContent = "Request another link";
    } catch (error) { accountNotice(error.message, true); }
    finally { button.disabled = false; if (button.textContent === "Please wait…") button.textContent = label; }
  });
});

function accountNotice(message, error = false) {
  document.getElementById("account-alert").innerHTML = `<div class="alert alert-${error ? "error" : "success"}">${escapeHtml(message)}</div>`;
}

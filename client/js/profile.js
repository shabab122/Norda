document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader("profile");
  renderFooter();
  if (!requireLogin()) return;
  await loadProfile();
});

async function loadProfile() {
  const root = document.getElementById("profile-root");
  try {
    const profile = await Api.get("/auth/profile");
    const address = profile.address || {};
    root.innerHTML = `
      <div class="profile-layout">
        <aside class="profile-summary">
          <span class="avatar" id="profile-summary-avatar">${escapeHtml(accountInitials(profile.name))}</span>
          <h2 id="profile-summary-name">${escapeHtml(profile.name)}</h2>
          <p>${escapeHtml(profile.email)}</p>
          <a href="${accountHome(profile)}" class="text-link">Back to my dashboard →</a>
          <a href="orders.html" class="text-link">View orders & invoices →</a>
        </aside>
        <form id="profile-form" class="checkout-card">
          <div class="checkout-card-head"><span>01</span><div><h2>Contact details</h2><p>Your email address is used to identify your account.</p></div></div>
          <div id="profile-alert" aria-live="polite"></div>
          <div class="form-grid two">
            <div class="field">
              <label for="profile-name">Full name</label>
              <input id="profile-name" type="text" required maxlength="80" value="${escapeHtml(profile.name)}" autocomplete="name" />
            </div>
            <div class="field">
              <label for="profile-email">Email</label>
              <input id="profile-email" type="email" value="${escapeHtml(profile.email)}" disabled />
            </div>
          </div>
          <hr class="form-divider" />
          <div class="checkout-card-head"><span>02</span><div><h2>Default delivery address</h2><p>Checkout can update these details later.</p></div></div>
          <div class="form-grid two">
            <div class="field field-wide"><label for="profile-line1">Street address</label><input id="profile-line1" type="text" maxlength="120" value="${escapeHtml(address.line1 || "")}" /></div>
            <div class="field field-wide"><label for="profile-line2">Apartment or landmark <span>Optional</span></label><input id="profile-line2" type="text" maxlength="120" value="${escapeHtml(address.line2 || "")}" /></div>
            <div class="field"><label for="profile-city">City</label><input id="profile-city" type="text" maxlength="60" value="${escapeHtml(address.city || "")}" /></div>
            <div class="field"><label for="profile-district">District</label><input id="profile-district" type="text" maxlength="60" value="${escapeHtml(address.district || "")}" /></div>
            <div class="field"><label for="profile-postcode">Postal code</label><input id="profile-postcode" type="text" maxlength="20" value="${escapeHtml(address.postCode || "")}" /></div>
            <div class="field"><label for="profile-phone">Phone</label><input id="profile-phone" type="tel" maxlength="20" value="${escapeHtml(address.phone || "")}" /></div>
            <div class="field field-wide"><label for="profile-country">Country</label><input id="profile-country" type="text" maxlength="60" value="${escapeHtml(address.country || "Bangladesh")}" /></div>
          </div>
          <details class="profile-security"><summary>Change password</summary>
            <p class="field-help">Changing your password signs out other sessions.</p>
            <div class="field"><label for="current-password">Current password</label><input type="password" id="current-password" autocomplete="current-password" /></div>
            <div class="field"><label for="new-password">New password</label><input type="password" id="new-password" minlength="8" maxlength="72" autocomplete="new-password" /></div>
            <div class="field"><label for="confirm-password">Confirm new password</label><input type="password" id="confirm-password" autocomplete="new-password" /></div>
          </details>
          <button class="btn btn-primary" type="submit" id="save-profile">Save profile</button>
        </form>
      </div>
    `;

    document.getElementById("profile-form").addEventListener("submit", saveProfile);
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><h2>Profile unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const button = document.getElementById("save-profile");
  const alert = document.getElementById("profile-alert");
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const password = document.getElementById("new-password").value;
    const currentPassword = document.getElementById("current-password").value;
    if (password && (password !== document.getElementById("confirm-password").value || !currentPassword)) throw new Error("Provide your current password and make sure the new passwords match.");
    if (password && new TextEncoder().encode(password).length > 72) throw new Error("The new password must fit within 72 UTF-8 bytes.");
    const updated = await Api.put("/auth/profile", {
      ...(password ? { password, currentPassword } : {}),
      name: document.getElementById("profile-name").value.trim(),
      address: {
        line1: document.getElementById("profile-line1").value.trim(),
        line2: document.getElementById("profile-line2").value.trim(),
        city: document.getElementById("profile-city").value.trim(),
        district: document.getElementById("profile-district").value.trim(),
        postCode: document.getElementById("profile-postcode").value.trim(),
        phone: document.getElementById("profile-phone").value.trim(),
        country: document.getElementById("profile-country").value.trim() || "Bangladesh",
      },
    });
    Api.setSession(updated);
    renderHeader("profile");
    document.getElementById("profile-summary-name").textContent = updated.name;
    document.getElementById("profile-summary-avatar").textContent = accountInitials(updated.name);
    for (const id of ["current-password", "new-password", "confirm-password"]) document.getElementById(id).value = "";
    alert.innerHTML = `<div class="alert alert-success">Profile saved.</div>`;
  } catch (error) {
    alert.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
    button.textContent = "Save profile";
  }
}

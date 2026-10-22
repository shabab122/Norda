let currentProfile;
let profileBusy = false;
document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader("profile"); renderFooter();
  if (requireLogin()) await loadProfile();
});
async function loadProfile() {
  try {
    const profile = await Api.get("/auth/profile");
    if (Api.getUser()?._id !== profile._id) { window.location.reload(); return; }
    renderProfile(profile);
  } catch (error) {
    document.getElementById("profile-root").innerHTML = `<div class="empty-state"><h2>Profile unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}
function renderProfile(profile) {
  currentProfile = profile; Api.setSession(profile);
  document.getElementById("profile-root").innerHTML = `
    <div class="profile-layout">
      <aside class="profile-summary">
        <span class="avatar">${escapeHtml(accountInitials(profile.name))}</span>
        <h2>${escapeHtml(profile.name)}</h2><p>${escapeHtml(profile.email)}</p>
        <span class="account-status ${profile.emailVerified ? "is-verified" : ""}">${profile.emailVerified ? "Email verified" : "Email not verified"}</span>
        <a href="${accountHome(profile)}" class="text-link">Back to my dashboard →</a>
        <a href="orders.html" class="text-link">View orders & invoices →</a>
        <a href="security.html" class="text-link">Devices & email preferences →</a>
      </aside>
      <div class="profile-content">
        <form id="profile-form" class="checkout-card">
          <div class="checkout-card-head"><span>01</span><div><h2>Contact & security</h2><p>Manage your name and password.</p></div></div>
          <div id="profile-alert" role="status" aria-live="polite"></div>
          <div class="form-grid two">
            <div class="field"><label for="profile-name">Full name</label><input id="profile-name" type="text" required maxlength="80" value="${escapeHtml(profile.name)}" autocomplete="name" /></div>
            <div class="field"><label for="profile-email">Email</label><input id="profile-email" type="email" value="${escapeHtml(profile.email)}" disabled /></div>
          </div>
          <details class="profile-security"><summary>Change password</summary>
            <p class="field-help">Changing your password signs out other sessions and cancels outstanding reset links.</p>
            <div class="field"><label for="current-password">Current password</label><input type="password" id="current-password" autocomplete="current-password" /></div>
            <div class="field"><label for="new-password">New password</label><input type="password" id="new-password" minlength="8" autocomplete="new-password" /></div>
            <div class="field"><label for="confirm-password">Confirm new password</label><input type="password" id="confirm-password" autocomplete="new-password" /></div>
          </details>
          <button class="btn btn-primary" type="submit" id="save-profile">Save profile</button>
        </form>
        <section class="checkout-card" aria-labelledby="verification-title">
          <div class="checkout-card-head"><span>02</span><div><h2 id="verification-title">Email verification</h2><p>${profile.emailVerified ? "Your account email has been confirmed." : "Confirm your email address with a one-use link sent to your inbox."}</p></div></div>
          <div id="verification-alert" role="status" aria-live="polite"></div>
          ${profile.emailVerified ? '<span class="account-status is-verified">Email verified</span>' : '<button type="button" class="btn btn-outline" id="send-verification">Send verification email</button><p class="field-help">Already requested a link? Check your inbox and spam folder.</p>'}
        </section>
        <section class="checkout-card" aria-labelledby="address-book-title">
          <div class="checkout-card-head"><span>03</span><div><h2 id="address-book-title">Delivery addresses</h2><p>Save up to 10 addresses. Choose one as your default for checkout.</p></div></div>
          <div id="address-alert" role="status" aria-live="polite"></div>
          <div id="address-list" class="address-list">${addressCardsHtml(profile.addresses || [])}</div>
          <button type="button" class="btn btn-outline" id="add-address" ${(profile.addresses || []).length >= 10 ? "disabled" : ""}>Add a delivery address</button>
          <form id="address-form" class="address-editor" hidden>
            <h3 id="address-editor-title">New address</h3><input type="hidden" id="address-id" />
            <div class="form-grid two">
              <div class="field field-wide"><label for="address-label">Address label</label><input id="address-label" required maxlength="30" placeholder="Home, Office or Family" autocomplete="off" /></div>
              ${addressInput("line1", "Street address", 120, "street-address", true)}
              ${addressInput("line2", "Apartment or landmark (optional)", 120, "address-line2", true, false)}
              ${addressInput("city", "City", 60, "address-level2")}
              ${addressInput("district", "District", 60, "address-level1")}
              ${addressInput("postCode", "Postal code", 20, "postal-code")}
              ${addressInput("phone", "Phone number", 20, "tel", false, true, "tel")}
              ${addressInput("country", "Country", 60, "country-name", true)}
            </div>
            <label class="account-checkbox"><input type="checkbox" id="address-default" /> Use as my default delivery address</label>
            <div id="address-form-alert" role="status" aria-live="polite"></div>
            <div class="account-actions"><button type="submit" class="btn btn-primary" id="save-address">Save address</button><button type="button" class="btn btn-outline" id="cancel-address">Cancel</button></div>
          </form>
        </section>
      </div>
    </div>`;
  document.getElementById("profile-form").addEventListener("submit", saveProfile);
  document.getElementById("send-verification")?.addEventListener("click", sendVerificationEmail);
  document.getElementById("add-address").addEventListener("click", () => openAddressEditor());
  document.getElementById("cancel-address").addEventListener("click", () => { document.getElementById("address-form").hidden = true; document.getElementById("add-address").focus(); });
  document.getElementById("address-form").addEventListener("submit", saveAddress);
  document.getElementById("address-list").addEventListener("click", handleAddressAction);
}
function addressInput(key, label, max, autocomplete, wide = false, required = true, type = "text") {
  return `<div class="field ${wide ? "field-wide" : ""}"><label for="saved-${key}">${label}</label><input id="saved-${key}" type="${type}" maxlength="${max}" autocomplete="${autocomplete}" ${required ? "required" : ""} /></div>`;
}
function addressCardsHtml(addresses) {
  if (!addresses.length) return '<p class="field-help">No saved addresses yet. Add your first delivery address below.</p>';
  return addresses.map((address) => `<article class="address-card ${address.isDefault ? "is-default" : ""}">
    <div class="address-card-heading"><h3>${escapeHtml(address.label)}</h3>${address.isDefault ? '<span class="account-status is-verified">Default</span>' : ""}</div>
    <address>${[address.line1, address.line2, [address.city, address.district, address.postCode].filter(Boolean).join(", "), address.country, address.phone].filter(Boolean).map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</address>
    <div class="account-actions"><button type="button" class="text-link" data-address-action="edit" data-address-id="${escapeHtml(address._id)}">Edit</button>
      ${address.isDefault ? "" : `<button type="button" class="text-link" data-address-action="default" data-address-id="${escapeHtml(address._id)}">Make default</button>`}
      <button type="button" class="text-link address-delete" data-address-action="delete" data-address-id="${escapeHtml(address._id)}">Delete</button></div>
  </article>`).join("");
}
function profileNotice(id, message, error = false) {
  document.getElementById(id).innerHTML = `<div class="alert alert-${error ? "error" : "success"}">${escapeHtml(message)}</div>`;
}
function sameProfileOwner(id) {
  if (Api.getUser()?._id === id) return true;
  window.location.reload(); return false;
}
async function saveProfile(event) {
  event.preventDefault(); if (profileBusy) return;
  const owner = currentProfile._id, button = document.getElementById("save-profile");
  profileBusy = true; button.disabled = true; button.textContent = "Saving…";
  try {
    const password = document.getElementById("new-password").value;
    const currentPassword = document.getElementById("current-password").value;
    if ((password || currentPassword || document.getElementById("confirm-password").value) && (!password || !currentPassword || password !== document.getElementById("confirm-password").value)) throw new Error("Provide your current password and make sure the new passwords match.");
    if (password && new TextEncoder().encode(password).length > 72) throw new Error("The new password must fit within 72 UTF-8 bytes.");
    const updated = await Api.put("/auth/profile", { name: document.getElementById("profile-name").value.trim(), ...(password ? { password, currentPassword } : {}) });
    if (!sameProfileOwner(owner)) return;
    renderProfile(updated); renderHeader("profile"); profileNotice("profile-alert", "Profile saved.");
  } catch (error) { if (sameProfileOwner(owner)) profileNotice("profile-alert", error.message, true); }
  finally { profileBusy = false; button.disabled = false; button.textContent = "Save profile"; }
}
async function sendVerificationEmail() {
  const owner = currentProfile._id, button = document.getElementById("send-verification");
  if (button.disabled) return;
  button.disabled = true; button.textContent = "Sending…";
  try {
    const result = await Api.post("/auth/send-verification", {});
    if (!sameProfileOwner(owner)) return;
    if (result.alreadyVerified) { await loadProfile(); return; }
    profileNotice("verification-alert", result.message);
  } catch (error) { if (sameProfileOwner(owner)) profileNotice("verification-alert", error.message, true); }
  finally { button.disabled = false; button.textContent = "Send verification email"; }
}
function openAddressEditor(address = {}) {
  document.getElementById("address-form").hidden = false;
  document.getElementById("address-form-alert").innerHTML = "";
  document.getElementById("address-editor-title").textContent = address._id ? "Edit address" : "New address";
  document.getElementById("address-id").value = address._id || "";
  document.getElementById("address-label").value = address.label || "";
  for (const key of ["line1", "line2", "city", "district", "postCode", "phone", "country"]) document.getElementById("saved-" + key).value = address[key] || (key === "country" ? "Bangladesh" : "");
  document.getElementById("address-default").checked = Boolean(address.isDefault || !(currentProfile.addresses || []).length);
  document.getElementById("address-label").focus();
}
async function saveAddress(event) {
  event.preventDefault(); if (profileBusy) return;
  const owner = currentProfile._id, button = document.getElementById("save-address");
  profileBusy = true; button.disabled = true;
  try {
    const id = document.getElementById("address-id").value;
    const body = { label: document.getElementById("address-label").value.trim(), isDefault: document.getElementById("address-default").checked };
    for (const key of ["line1", "line2", "city", "district", "postCode", "phone", "country"]) body[key] = document.getElementById("saved-" + key).value.trim();
    const profile = id ? await Api.put("/auth/addresses/" + encodeURIComponent(id), body) : await Api.post("/auth/addresses", body);
    if (!sameProfileOwner(owner)) return;
    renderProfile(profile); profileNotice("address-alert", "Delivery address saved."); document.getElementById("add-address").focus();
  } catch (error) { if (sameProfileOwner(owner)) profileNotice("address-form-alert", error.message, true); }
  finally { profileBusy = false; button.disabled = false; }
}
async function handleAddressAction(event) {
  const button = event.target.closest("button[data-address-action]");
  if (!button || profileBusy) return;
  const address = currentProfile.addresses.find((entry) => entry._id === button.dataset.addressId);
  if (!address) return;
  const action = button.dataset.addressAction;
  if (action === "edit") { openAddressEditor(address); return; }
  if (action === "delete" && !window.confirm("Delete this saved address? Your past orders and invoices will keep their original delivery details.")) return;
  const owner = currentProfile._id;
  profileBusy = true; button.disabled = true;
  try {
    const url = "/auth/addresses/" + encodeURIComponent(address._id);
    const profile = action === "delete" ? await Api.del(url) : await Api.put(url + "/default", {});
    if (!sameProfileOwner(owner)) return;
    renderProfile(profile); profileNotice("address-alert", action === "delete" ? "Address deleted." : "Default delivery address updated.");
  } catch (error) { if (sameProfileOwner(owner)) profileNotice("address-alert", error.message, true); }
  finally { profileBusy = false; button.disabled = false; }
}

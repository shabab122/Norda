const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const client = path.join(__dirname, "../../client");
const read = (name) => fs.readFileSync(path.join(client, name), "utf8");
const buyer = { _id: "1234567890abcdef12345678", name: "Buyer", email: "buyer@norda.example", role: "user", emailVerified: false, address: {} };
const home = { _id: "1234567890abcdef12345671", label: 'Home "One"', line1: "<Road one>", line2: "", city: "Dhaka", district: "Dhaka", postCode: "1207", phone: "01712345678", country: "Bangladesh", isDefault: true };
const office = { ...home, _id: "1234567890abcdef12345672", label: "Office", line1: "Office Road", isDefault: false };
function setup(file, { action = "forgot", token = "" } = {}) {
  const events = {}, elements = {}, writes = [];
  const get = (id) => elements[id] ||= { innerHTML: "", textContent: "Submit", value: "", checked: false, hidden: false, disabled: false, addEventListener(type, handler) { this[type] = handler; }, focus() {}, scrollIntoView() {}, querySelectorAll: () => [] };
  const scope = vm.createContext({ console, TextEncoder, URLSearchParams, setTimeout, clearTimeout,
    document: { body: { dataset: { accountAction: action } }, getElementById: get, addEventListener(type, callback) { events[type] = callback; }, querySelectorAll: () => [] },
    window: { location: { pathname: "/" + action + ".html", hash: token ? "#token=" + token : "", search: "", reload() {} }, history: { replaceState() { scope.cleaned = true; } }, addEventListener() {}, confirm: () => true },
    API_BASE_URL: "/api", Api: { ready: Promise.resolve(), getUser: () => buyer, isLoggedIn: () => true, setSession(user) { scope.savedUser = user; }, async restoreSession() { scope.restored = true; }, logout() { scope.loggedOut = true; }, async post(url, body) { writes.push({ url, body }); return { message: "Saved" }; } },
  });
  vm.runInContext(read("js/layout.js"), scope);
  scope.renderHeader = () => {}; scope.renderFooter = () => {}; scope.requireLogin = () => true;
  vm.runInContext(read(file), scope);
  return { scope, events, get, writes };
}
test("Verification removes the URL secret and only sends it after explicit confirmation", async () => {
  const token = "a".repeat(64);
  const { scope, events, get, writes } = setup("js/account-recovery.js", { action: "verify", token });
  await events.DOMContentLoaded(); assert.equal(writes.length, 0); assert.equal(scope.cleaned, true);
  await get("account-form").submit({ preventDefault() {} });
  assert.equal(writes[0].url, "/auth/verify-email"); assert.equal(writes[0].body.token, token);
  assert.equal(get("account-form").hidden, true); assert.equal(scope.restored, true);
  assert.doesNotMatch(get("account-alert").innerHTML, new RegExp(token));
});
test("Reset UI rejects mismatches and long UTF-8 passwords, then clears the old client session", async () => {
  const { scope, events, get, writes } = setup("js/account-recovery.js", { action: "reset", token: "b".repeat(64) });
  await events.DOMContentLoaded();
  get("account-password").value = "NewPassword123"; get("account-confirm-password").value = "OtherPassword123";
  await get("account-form").submit({ preventDefault() {} }); assert.equal(writes.length, 0);
  get("account-password").value = get("account-confirm-password").value = "🙂".repeat(30);
  await get("account-form").submit({ preventDefault() {} }); assert.equal(writes.length, 0);
  get("account-password").value = get("account-confirm-password").value = "NewPassword123";
  await get("account-form").submit({ preventDefault() {} });
  assert.equal(writes[0].url, "/auth/reset-password"); assert.equal(scope.loggedOut, true); assert.equal(get("account-form").hidden, true);
});
test("Recovery missing-link and server-error states escape output and preserve retry controls", async () => {
  const missing = setup("js/account-recovery.js", { action: "reset" });
  await missing.events.DOMContentLoaded(); assert.equal(missing.get("account-form").hidden, true); assert.equal(missing.writes.length, 0);
  const { scope, events, get } = setup("js/account-recovery.js");
  scope.Api.post = async () => { throw new Error('<script>"failure"</script>'); };
  await events.DOMContentLoaded(); get("account-email").value = buyer.email;
  await get("account-form").submit({ preventDefault() {} });
  assert.match(get("account-alert").innerHTML, /&lt;script&gt;/); assert.doesNotMatch(get("account-alert").innerHTML, /<script>/); assert.equal(get("account-submit").disabled, false);
});
test("A second recovery submit cannot duplicate an in-flight request", async () => {
  const { scope, events, get } = setup("js/account-recovery.js");
  let release, calls = 0;
  scope.Api.post = async () => { calls++; await new Promise((resolve) => { release = resolve; }); return { message: "Check your email" }; };
  await events.DOMContentLoaded(); get("account-email").value = buyer.email;
  const pending = get("account-form").submit({ preventDefault() {} });
  await get("account-form").submit({ preventDefault() {} }); assert.equal(calls, 1);
  release(); await pending; assert.equal(get("account-submit").disabled, false);
});
test("Profile renders escaped address cards and saves contact changes without overwriting the address book", async () => {
  const { scope, get } = setup("js/profile.js");
  const profile = { ...buyer, addresses: [home, office], defaultAddressId: home._id };
  scope.Api.get = async () => profile;
  let body;
  scope.Api.put = async (url, value) => { body = value; return { ...profile, name: value.name }; };
  await scope.loadProfile();
  const html = get("profile-root").innerHTML;
  assert.match(html, /Home &quot;One&quot;/); assert.match(html, /&lt;Road one&gt;/); assert.match(html, /data-address-action="default"/); assert.match(html, /Email not verified/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]); assert.equal(ids.length, new Set(ids).size);
  get("profile-name").value = "Updated buyer";
  await scope.saveProfile({ preventDefault() {} });
  assert.equal(body.name, "Updated buyer"); assert.equal(body.address, undefined); assert.equal(body.addresses, undefined); assert.equal(scope.savedUser.name, "Updated buyer");
});
test("Address editor preserves identity and submits its own fields without changing account credentials", async () => {
  const { scope, get } = setup("js/profile.js");
  const profile = { ...buyer, addresses: [home, office] }; let sent;
  scope.renderProfile(profile); scope.openAddressEditor(office);
  assert.equal(get("address-id").value, office._id); assert.equal(get("saved-line1").value, office.line1);
  scope.Api.put = async (url, body) => { sent = { url, body }; return profile; };
  get("saved-line1").value = "Changed office";
  await scope.saveAddress({ preventDefault() {} });
  assert.equal(sent.url, "/auth/addresses/" + office._id); assert.equal(sent.body.line1, "Changed office"); assert.equal(sent.body.password, undefined); assert.equal(sent.body.email, undefined);
});
test("Checkout picks saved addresses and keeps manual order edits separate from the saved book", async () => {
  const { scope, get } = setup("js/checkout.js");
  const profile = { ...buyer, address: home, addresses: [home, office] };
  scope.Api.get = async (url) => url === "/auth/profile" ? profile : url === "/cart" ? { items: [{ product: { _id: "p", name: "Item", stock: 3 }, quantity: 1, price: 500 }] } : { demoEnabled: false, sslcommerzEnabled: false };
  scope.getStoreConfig = async () => ({ freeShippingThreshold: 5000, flatShippingFee: 120 });
  scope.bindCheckoutForm = () => {};
  await scope.loadCheckout();
  assert.match(get("checkout-root").innerHTML, /Home &quot;One&quot; \(Default\)/);
  get("checkout-saved-address").value = office._id; get("checkout-saved-address").change();
  assert.equal(scope.shippingPayload().line1, office.line1);
  get("address-line").value = "This order only"; assert.equal(scope.shippingPayload().line1, "This order only"); assert.equal(office.line1, "Office Road");
  get("checkout-saved-address").value = "new"; get("checkout-saved-address").change();
  assert.equal(get("address-line").value, ""); assert.equal(get("country").value, "Bangladesh");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const id = "a".repeat(24);
function setup(file) {
  let user = { _id: "admin-one", name: "Admin", role: "admin" }; const elements = new Map();
  const get = (key) => { if (!elements.has(key)) elements.set(key, { innerHTML: "", textContent: "", hidden: false, value: "", disabled: false, dataset: {}, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, appendChild() {}, setAttribute() {} }); return elements.get(key); };
  const scope = vm.createContext({ console, crypto, URL, URLSearchParams, setTimeout() {}, API_BASE_URL: "/api", document: { body: { dataset: {} }, addEventListener() {}, getElementById: get, querySelectorAll: () => [], createElement: () => get(crypto.randomUUID()) }, window: { addEventListener() {}, location: { pathname: "/admin/courier.html", search: "", href: "" }, confirm: () => true }, Api: { ready: Promise.resolve(), getUser: () => user, isLoggedIn: () => Boolean(user), isAdmin: () => user?.role === "admin", can: (s) => user?.role === "admin" || user?.permissions?.includes(s) } });
  for (const f of ["js/layout.js", "js/management-common.js", file]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../../client", f), "utf8"), scope);
  return { scope, get, setUser: (v) => user = v };
}
test("Courier detail escapes provider text and uncertain bookings expose reconciliation instead of resubmission", () => {
  const { scope } = setup("admin/courier.js"); const html = scope.courierDetailHtml({ _id: id, order: id, status: "unknown", reference: "NOR123", payload: { recipient_name: '<script>alert(1)</script>', recipient_area: '<Area "A">' }, exceptionStatus: "open", exceptionReason: "<Failure>" }); assert.match(html, /&lt;script&gt;/); assert.match(html, /data-courier-action="sync"/); assert.doesNotMatch(html, /data-courier-action="cancel"|data-courier-action="label"|<script>/);
  const booked = scope.courierDetailHtml({ _id: id, order: id, status: "booked", trackingNumber: "ECR12345678901" }); assert.match(booked, /Get carrier label/);
});
test("Image storage responses from an old account never render private asset metadata", async () => {
  const { scope, get, setUser } = setup("admin/media.js"); vm.runInContext('mediaOwner = "admin-one";', scope); let finish; scope.Api.get = () => new Promise((r) => finish = r); const pending = scope.loadMedia(1); setUser({ _id: "staff-two", role: "staff" }); finish({ items: [{ filename: "private-old-file.png" }] }); await pending; assert.equal(get("media-root").innerHTML, "");
});
test("System monitor discards a stale account response before rendering backup history", async () => {
  const { scope, get, setUser } = setup("admin/system.js"); vm.runInContext('systemOwner = "admin-one";', scope); let finish; scope.Api.get = () => new Promise((r) => finish = r); const pending = scope.loadSystem(); setUser({ _id: "customer-two", role: "user" }); finish({ readiness: "ready", lastBackups: [{ filename: "secret.ndb" }] }); await pending; assert.equal(get("backup-history").innerHTML, "");
});
test("Staff permissions include courier/media tools but never the backup/monitoring workspace", () => {
  const { scope, setUser } = setup("admin/courier.js"); setUser({ _id: id, role: "staff", permissions: ["orders", "catalog"] }); assert.equal(scope.requireAdmin(), true); scope.window.location.pathname = "/admin/media.html"; assert.equal(scope.requireAdmin(), true); scope.window.location.pathname = "/admin/system.html"; assert.equal(scope.requireAdmin(), false); assert.equal(scope.window.location.href, "workspace.html");
});

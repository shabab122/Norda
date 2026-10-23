const Guest = {
  current: null,
  creating: null,
  async restore() { try { const value = await Api.get("/guest/session"); this.current = value.active ? value : null; } catch { this.current = null; } return this.current; },
  async ensure() {
    if (this.current) return this.current;
    if (!this.creating) this.creating = Api.post("/guest/session", {}).then(value => { this.current = value; this.changed(); return value; }).finally(() => { this.creating = null; });
    return this.creating;
  },
  changed() { try { localStorage.setItem("norda_guest_revision", String(Date.now())); } catch { /* Shopping still uses the private server cookie. */ } },
  async mergeAfterSignIn() {
    if (!this.current || !Api.isLoggedIn()) return;
    try { const result = await Api.post("/guest/merge-cart", {}); if (result.merged) sessionStorage.setItem("norda_cart_notice", JSON.stringify({ message: "Your guest cart was added to your account cart.", type: "success" })); }
    catch { try { sessionStorage.setItem("norda_cart_notice", JSON.stringify({ message: "Your guest cart was kept separately. Review it from Guest orders before merging.", type: "warning" })); } catch { /* Optional notice. */ } }
  },
};
const originalGuestReady = Api.ready;
Api.ready = Promise.resolve(originalGuestReady).then(async user => { await Guest.restore(); return user; });
window.addEventListener("storage", async event => {
  if (event.key !== "norda_guest_revision") return;
  const previous = Guest.current?.id; await Guest.restore();
  if (previous !== Guest.current?.id) window.location.reload();
});

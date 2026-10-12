const Api = {
  readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } },
  writeStorage(key, value) { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* Cookie authentication still works. */ } },
  getToken() { return this.readStorage("norda_token"); },
  setSession(user, { replaceToken = false } = {}) {
    const old = this.getUser();
    if (user.token) this.writeStorage("norda_token", user.token);
    else if (replaceToken || (old && old._id !== user._id)) this.writeStorage("norda_token", null);
    this.writeStorage("norda_user", JSON.stringify({ _id: user._id, name: user.name, email: user.email, role: user.role, address: user.address || null }));
    this.currentUser = user;
  },
  getUser() {
    if (this.currentUser) return this.currentUser;
    try { return JSON.parse(this.readStorage("norda_user") || "null"); } catch { return null; }
  },
  isLoggedIn() { return Boolean(this.getUser()); },
  isAdmin() { return this.getUser()?.role === "admin"; },
  logout() {
    this.currentUser = null;
    this.writeStorage("norda_token", null); this.writeStorage("norda_user", null);
    try { sessionStorage.removeItem("norda_checkout"); } catch { /* Optional cache. */ }
  },
  async restoreSession() {
    try {
      const user = await this.get("/auth/profile");
      this.setSession(user);
      return user;
    } catch (error) {
      if (error.status === 401) this.logout();
      return this.getUser();
    }
  },
  async request(path, { method = "GET", body, isForm = false, signal } = {}) {
    const headers = { Accept: "application/json" };
    const token = this.getToken();
    if (token) headers.Authorization = "Bearer " + token;
    if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
    const controller = signal ? null : new AbortController();
    const timeout = controller && setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(API_BASE_URL + path, {
        method, headers, credentials: "include", signal: signal || controller.signal,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      });
    } catch (failure) {
      if (signal?.aborted) throw failure;
      throw new Error(failure.name === "AbortError" ? "The request took too long. Check your orders before repeating checkout." : "Cannot reach Norda. Please check your connection and try again.");
    } finally { if (timeout) clearTimeout(timeout); }
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text().catch(() => "");
    if (!response.ok) {
      const error = new Error(data?.message || "Request failed with status " + response.status);
      error.status = response.status; error.orderId = data?.orderId; error.invoiceNumber = data?.invoiceNumber;
      if (response.status === 401 && !path.includes("/auth/login")) {
        this.logout();
        window.dispatchEvent(new CustomEvent("norda:session-expired"));
      }
      throw error;
    }
    return data;
  },
  get(path, options = {}) { return this.request(path, options); },
  post(path, body, options = {}) { return this.request(path, { method: "POST", body, ...options }); },
  put(path, body, options = {}) { return this.request(path, { method: "PUT", body, ...options }); },
  del(path) { return this.request(path, { method: "DELETE" }); },
  async download(path, fallbackName) {
    const headers = {};
    const token = this.getToken(); if (token) headers.Authorization = "Bearer " + token;
    const response = await fetch(API_BASE_URL + path, { headers, credentials: "include" });
    if (!response.ok) {
      if (response.status === 401) { this.logout(); window.dispatchEvent(new CustomEvent("norda:session-expired")); }
      const data = await response.json().catch(() => null);
      throw new Error(data?.message || "Download failed");
    }
    const match = (response.headers.get("content-disposition") || "").match(/filename="([^"]+)"/);
    const blobUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = blobUrl; link.download = match?.[1] || fallbackName;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  },
};
Api.ready = Api.restoreSession();

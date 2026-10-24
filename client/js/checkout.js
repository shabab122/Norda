document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader();
  renderFooter();
  try { if (!Api.isLoggedIn() && typeof Guest !== "undefined") await Guest.ensure(); }
  catch (error) { document.getElementById("checkout-root").innerHTML = `<div class="empty-state"><h2>Checkout unavailable</h2><p>${escapeHtml(error.message)}</p><a class="btn btn-outline" href="cart.html">Return to cart</a></div>`; return; }
  if (!requireShopper()) return;
  await loadCheckout();
});

async function loadCheckout() {
  checkoutOwner = shoppingIdentity();
  const root = document.getElementById("checkout-root");
  try {
    const [cart, profile, paymentConfig, store] = await Promise.all([
      Api.get("/cart"),
      Api.isLoggedIn() ? Api.get("/auth/profile") : Promise.resolve({ address: {}, addresses: [], ...(Guest.current || {}) }),
      Api.get("/payments/config"),
      getStoreConfig(),
    ]);
    if (shoppingIdentity() !== checkoutOwner) return;
    const items = cart.items || [];
    if (items.some((item) => item.unavailable || !item.product || item.quantity > (item.stock ?? item.product.stock))) {
      root.innerHTML = `<div class="empty-state"><h2>Your cart needs a quick review</h2><p>An item or quantity is no longer available. Your selection has been kept.</p><a class="btn btn-primary" href="cart.html">Review cart</a></div>`;
      return;
    }
    checkoutCartSignature = JSON.stringify(items.map((item) => [item.product._id, item.variantId || "", item.quantity, item.price]));
    checkoutSignature = checkoutCartSignature;
    checkoutCouponCode = "";
    if (!items.length) {
      root.innerHTML = `<div class="empty-state spacious"><h2>Your cart is empty</h2><p>Add at least one product before checkout.</p><a class="btn btn-primary" href="products.html">Browse products</a></div>`;
      return;
    }

    const subtotal = Number(items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
    const shipping = subtotal >= store.freeShippingThreshold ? 0 : store.flatShippingFee;
    const total = Number((subtotal + shipping).toFixed(2));
    checkoutQuote = { subtotal, shippingFee: shipping, discountAmount: 0, totalAmount: total };
    const address = profile.address || {};
    checkoutAddresses = profile.addresses || [];

    root.innerHTML = `
      <div class="checkout-layout">
        <form id="checkout-form" class="checkout-form">
          <section class="checkout-card">
            <div class="checkout-card-head"><span>01</span><div><h2>Delivery details</h2><p>Choose a saved address or enter the delivery details for this order.</p></div></div>
            <div id="checkout-alert" aria-live="polite"></div>
            ${!Api.isLoggedIn() ? `<div class="form-grid two"><div class="field"><label for="guest-name">Your name</label><input id="guest-name" name="guest-name" required maxlength="80" autocomplete="name" value="${escapeHtml(Guest.current?.name === "Guest shopper" ? "" : Guest.current?.name || "")}" /></div><div class="field"><label for="guest-email">Order email</label><input id="guest-email" name="guest-email" type="email" required maxlength="254" autocomplete="email" value="${escapeHtml(Guest.current?.email || "")}" /></div></div><p class="field-help">We will send order updates here. You can link your purchase to a matching verified account later.</p>` : checkoutAddressPicker(profile)}
            <div class="form-grid two">
              <div class="field field-wide">
                <label for="address-line">Street address</label>
                <input type="text" id="address-line" required maxlength="120" autocomplete="street-address" value="${escapeHtml(address.line1 || "")}" placeholder="House, road and area" />
              </div>
              <div class="field field-wide">
                <label for="address-line-2">Apartment or landmark <span>Optional</span></label>
                <input type="text" id="address-line-2" maxlength="120" value="${escapeHtml(address.line2 || "")}" placeholder="Apartment, floor or nearby landmark" />
              </div>
              <div class="field">
                <label for="city">City</label>
                <input type="text" id="city" required maxlength="60" autocomplete="address-level2" value="${escapeHtml(address.city || "Dhaka")}" />
              </div>
              <div class="field">
                <label for="district">District</label>
                <input type="text" id="district" required maxlength="60" autocomplete="address-level1" value="${escapeHtml(address.district || "Dhaka")}" />
              </div>
              <div class="field"><label for="courier-thana">Thana <span>Optional courier detail</span></label><input id="courier-thana" type="text" maxlength="40" value="${escapeHtml(address.thana || "")}" /></div>
              <div class="field"><label for="courier-area">Area <span>Optional courier detail</span></label><input id="courier-area" type="text" maxlength="40" value="${escapeHtml(address.area || "")}" /></div>
              <div class="field">
                <label for="postcode">Postal code</label>
                <input type="text" id="postcode" required maxlength="20" autocomplete="postal-code" value="${escapeHtml(address.postCode || "")}" placeholder="1207" />
              </div>
              <div class="field">
                <label for="phone">Phone number</label>
                <input type="tel" id="phone" required maxlength="20" autocomplete="tel" value="${escapeHtml(address.phone || "")}" placeholder="+880 1XXXXXXXXX" />
              </div>
              <div class="field field-wide">
                <label for="country">Country</label>
                <input type="text" id="country" required maxlength="60" autocomplete="country-name" value="${escapeHtml(address.country || "Bangladesh")}" />
              </div>
            </div>
          </section>

          <section class="checkout-card">
            <div class="checkout-card-head"><span>02</span><div><h2>Payment method</h2><p>Choose the way you would like to pay.</p></div></div>
            <div class="payment-options">
              ${paymentConfig.demoEnabled ? `
                <p class="payment-context"><strong>Test environment</strong> · Payments are simulated; no money is transferred.</p>
                <label class="payment-option selected">
                  <input type="radio" name="payment-method" value="demo_mobile_banking" checked />
                  <span class="payment-copy"><strong>Mobile Banking / bKash</strong><small>Pay with mobile banking</small></span>
                </label>
                <label class="payment-option">
                  <input type="radio" name="payment-method" value="demo_card_bank" />
                  <span class="payment-copy"><strong>Card / Bank</strong><small>Pay by card or bank</small></span>
                </label>` : ""}
              ${paymentConfig.sslcommerzEnabled ? `
                <label class="payment-option ${paymentConfig.demoEnabled ? "" : "selected"}">
                  <input type="radio" name="payment-method" value="sslcommerz" ${paymentConfig.demoEnabled ? "" : "checked"} />
                  <span class="payment-copy"><strong>SSLCOMMERZ ${paymentConfig.environment === "live" ? "Live" : "Sandbox"}</strong><small>Continue to the configured provider checkout</small></span>
                </label>` : ""}
              <label class="payment-option ${paymentConfig.sslcommerzEnabled || paymentConfig.demoEnabled ? "" : "selected"}">
                <input type="radio" name="payment-method" value="cod" ${paymentConfig.sslcommerzEnabled || paymentConfig.demoEnabled ? "" : "checked"} />
                <span class="payment-copy"><strong>Cash on delivery</strong><small>Pay when the order reaches you</small></span>
              </label>
            </div>
          </section>
        </form>

        <aside class="summary-card checkout-summary">
          <span class="eyebrow">Your order</span>
          <h2>${items.length} product${items.length === 1 ? "" : "s"}</h2>
          <div class="checkout-items">
            ${items
              .map(
                (item) => `<div><span>${escapeHtml(item.product.name)}${item.variantId ? ` <small>${escapeHtml(variantLabel(item))}</small>` : ""} <small>× ${item.quantity}</small></span><strong>${money(item.price * item.quantity)}</strong></div>`
              )
              .join("")}
          </div>
          <div class="coupon-entry"><form id="coupon-entry-form"><label for="checkout-coupon">Coupon code</label><div class="coupon-entry-controls"><input id="checkout-coupon" maxlength="32" autocomplete="off" placeholder="Enter your code" /><button type="submit" class="btn btn-outline btn-sm" id="apply-coupon">Apply</button></div></form><div id="coupon-feedback" class="coupon-feedback" role="status" aria-live="polite"></div><button type="button" class="text-button" id="remove-coupon" hidden>Remove coupon</button><p><a href="coupons.html" class="text-link">Explore current offers</a></p></div>
          <div class="summary-row"><span>Subtotal</span><span id="checkout-subtotal">${money(subtotal)}</span></div>
          <div class="summary-row coupon-discount" id="checkout-discount-row" hidden><span id="checkout-discount-label">Coupon discount</span><span id="checkout-discount"></span></div>
          <div class="summary-row"><span>Delivery</span><span id="checkout-shipping">${shipping ? money(shipping) : "Free"}</span></div>
          <div class="summary-row summary-total"><span>Total</span><span id="checkout-total">${money(total)}</span></div>
          <button type="submit" form="checkout-form" class="btn btn-primary btn-block" id="place-order-btn">Continue securely</button>
          <p class="summary-note">By continuing, you confirm that the delivery details are correct.</p>
        </aside>
      </div>
    `;

    bindCheckoutAddressSelection();
    bindCheckoutForm();
    bindCheckoutCoupon();
    const offeredCode = new URLSearchParams(window.location.search).get("coupon");
    if (offeredCode) { document.getElementById("checkout-coupon").value = offeredCode.slice(0, 32); await updateCheckoutCoupon(offeredCode); }
  } catch (error) {
    if (shoppingIdentity() !== checkoutOwner) return;
    root.innerHTML = `<div class="empty-state"><h2>Checkout unavailable</h2><p>${escapeHtml(error.message)}</p><a class="btn btn-primary" href="cart.html">Return to cart</a></div>`;
  }
}

let checkoutAddresses = [];
function checkoutAddressPicker(profile) {
  const addresses = profile.addresses || [];
  return `<div class="field saved-address-picker">${addresses.length ? `<label for="checkout-saved-address">Saved delivery address</label><select id="checkout-saved-address">${addresses.map((entry) => `<option value="${escapeHtml(entry._id)}" ${entry.isDefault ? "selected" : ""}>${escapeHtml(entry.label)}${entry.isDefault ? " (Default)" : ""} — ${escapeHtml(entry.line1)}</option>`).join("")}<option value="new">Use a different address</option></select>` : ""}<small class="field-help">Edits below apply to this order. <a class="text-link" href="profile.html">Manage saved addresses</a> in your profile.</small></div>`;
}
function bindCheckoutAddressSelection() {
  const select = document.getElementById("checkout-saved-address");
  if (!select) return;
  select.addEventListener("change", () => {
    const address = checkoutAddresses.find((entry) => entry._id === select.value) || {};
    const fields = { "courier-thana": "thana", "courier-area": "area", "address-line": "line1", "address-line-2": "line2", city: "city", district: "district", postcode: "postCode", phone: "phone", country: "country" };
    for (const [id, key] of Object.entries(fields)) document.getElementById(id).value = address[key] || (key === "country" ? "Bangladesh" : "");
  });
}

function shippingPayload() {
  return {
    ...(document.getElementById("courier-thana")?.value?.trim() ? { thana: document.getElementById("courier-thana").value.trim() } : {}),
    ...(document.getElementById("courier-area")?.value?.trim() ? { area: document.getElementById("courier-area").value.trim() } : {}),
    line1: document.getElementById("address-line").value.trim(),
    line2: document.getElementById("address-line-2").value.trim(),
    city: document.getElementById("city").value.trim(),
    district: document.getElementById("district").value.trim(),
    postCode: document.getElementById("postcode").value.trim(),
    country: document.getElementById("country").value.trim(),
    phone: document.getElementById("phone").value.trim(),
  };
}

function bindCheckoutForm() {
  const selectedMethod = document.querySelector('input[name="payment-method"]:checked');
  if (selectedMethod) {
    document.getElementById("place-order-btn").textContent =
      checkoutButtonLabel(selectedMethod.value);
  }

  document.querySelectorAll('input[name="payment-method"]').forEach((input) => {
    input.addEventListener("change", () => {
      document.querySelectorAll(".payment-option").forEach((option) => option.classList.remove("selected"));
      input.closest(".payment-option").classList.add("selected");
      document.getElementById("place-order-btn").textContent =
        checkoutButtonLabel(input.value);
    });
  });

  document.getElementById("checkout-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("place-order-btn");
    if (button.disabled || couponBusy || checkoutSubmitting || shoppingIdentity() !== checkoutOwner) return;
    checkoutSubmitting = true;
    const alert = document.getElementById("checkout-alert");
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    button.disabled = true;
    button.textContent = paymentMethod.startsWith("demo_") ? "Opening payment…" : paymentMethod === "sslcommerz" ? "Opening secure payment…" : "Creating order…";
    alert.innerHTML = "";

    try {
      if (!Api.isLoggedIn()) { const contact = await Api.post("/guest/contact", { name: document.getElementById("guest-name").value.trim(), email: document.getElementById("guest-email").value.trim() }); if (shoppingIdentity() !== checkoutOwner) return; Guest.current = contact; }
      if (paymentMethod.startsWith("demo_")) {
        const result = await Api.post("/payments/demo/initiate", {
          shippingAddress: shippingPayload(), channel: paymentMethod.slice(5),
          checkoutKey: checkoutKey(paymentMethod), couponCode: checkoutCouponCode, expectedTotals: checkoutQuote,
        });
        if (shoppingIdentity() !== checkoutOwner) return;
        clearCheckoutKey();
        window.location.assign(result.checkoutUrl);
        return;
      }
      if (paymentMethod === "sslcommerz") {
        const result = await Api.post("/payments/sslcommerz/initiate", {
          shippingAddress: shippingPayload(),
          checkoutKey: checkoutKey(paymentMethod), couponCode: checkoutCouponCode, expectedTotals: checkoutQuote,
        });
        if (shoppingIdentity() !== checkoutOwner) return;
        clearCheckoutKey();
        window.location.assign(result.alreadyPaid ? "orders.html" : result.checkoutUrl);
        return;
      }
      const order = await Api.post("/orders", {
        shippingAddress: shippingPayload(),
        paymentMethod: "cod",
        checkoutKey: checkoutKey(paymentMethod), couponCode: checkoutCouponCode, expectedTotals: checkoutQuote,
      });
      if (shoppingIdentity() !== checkoutOwner) return;
      clearCheckoutKey();
      const query = new URLSearchParams({
        placed: order._id,
        invoice: order.invoiceNumber || "",
      });
      window.location.href = (Api.isLoggedIn() ? "orders.html?" : "guest-orders.html?") + query.toString();
    } catch (error) {
      if (shoppingIdentity() !== checkoutOwner) return;
      if (error.orderId) {
        clearCheckoutKey();
        alert.innerHTML = `<div class="alert alert-warning"><strong>Your order is saved.</strong><p>${escapeHtml(error.message)}</p><p><a href="orders.html">View your order and payment status</a> before starting another checkout.</p></div>`;
        button.textContent = "Order saved — check My Orders";
        alert.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      } else {
        alert.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)}</div>`;
      }
      checkoutSubmitting = false;
      button.disabled = false;
      button.textContent = checkoutButtonLabel(paymentMethod);
      alert.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

let checkoutCouponCode = "", checkoutQuote, checkoutCartSignature = "", checkoutOwner, couponBusy = false, checkoutSubmitting = false;
let checkoutSignature = "";
let memoryCheckout;
function checkoutKey(method) {
  let saved = memoryCheckout;
  try { saved ||= JSON.parse(sessionStorage.getItem("norda_checkout") || "null"); } catch { /* Optional cache. */ }
  if (!saved || saved.signature !== checkoutSignature || saved.method !== method) {
    saved = { key: window.crypto?.randomUUID ? window.crypto.randomUUID() : "norda-" + Date.now() + "-" + Math.random().toString(36).slice(2), signature: checkoutSignature, method };
  }
  memoryCheckout = saved;
  try { sessionStorage.setItem("norda_checkout", JSON.stringify(saved)); } catch { /* The in-page key still prevents duplicate submissions. */ }
  return saved.key;
}
function clearCheckoutKey() { memoryCheckout = null; try { sessionStorage.removeItem("norda_checkout"); } catch {} }

function checkoutButtonLabel(method) {
  return method.startsWith("demo_") ? "Continue to payment" : method === "sslcommerz" ? "Continue to secure payment" : "Place cash-on-delivery order";
}

function bindCheckoutCoupon() {
  document.getElementById("coupon-entry-form").addEventListener("submit", (event) => { event.preventDefault(); updateCheckoutCoupon(document.getElementById("checkout-coupon").value); });
  document.getElementById("remove-coupon").addEventListener("click", () => updateCheckoutCoupon(""));
}
function renderCheckoutQuote() {
  document.getElementById("checkout-subtotal").textContent = money(checkoutQuote.subtotal);
  document.getElementById("checkout-shipping").textContent = checkoutQuote.shippingFee ? money(checkoutQuote.shippingFee) : "Free";
  document.getElementById("checkout-total").textContent = money(checkoutQuote.totalAmount);
  document.getElementById("checkout-discount-row").hidden = !checkoutQuote.discountAmount;
  document.getElementById("checkout-discount-label").textContent = "Coupon " + checkoutCouponCode;
  document.getElementById("checkout-discount").textContent = "−" + money(checkoutQuote.discountAmount);
  document.getElementById("remove-coupon").hidden = !checkoutCouponCode;
}
async function updateCheckoutCoupon(code) {
  if (couponBusy || checkoutSubmitting || shoppingIdentity() !== checkoutOwner) return;
  couponBusy = true;
  const ids = ["apply-coupon", "remove-coupon", "checkout-coupon", "place-order-btn"];
  ids.forEach((id) => document.getElementById(id).disabled = true);
  const feedback = document.getElementById("coupon-feedback"); feedback.textContent = "Checking your current cart…";
  try {
    if (code.trim() && !Api.isLoggedIn()) {
      const name = document.getElementById("guest-name"), email = document.getElementById("guest-email");
      if (!name.value.trim() || !email.value.trim() || !email.checkValidity()) throw new Error("Enter your name and valid order email before applying a coupon.");
      const contact = await Api.post("/guest/contact", { name: name.value.trim(), email: email.value.trim() });
      if (shoppingIdentity() !== checkoutOwner) return;
      Guest.current = contact;
    }
    const quote = await Api.post("/coupons/preview", { code: code.trim() });
    if (shoppingIdentity() !== checkoutOwner) return;
    if (quote.cartSignature !== checkoutCartSignature) throw new Error("Your cart or prices changed. Refresh checkout to review the current items.");
    checkoutCouponCode = quote.coupon?.code || "";
    checkoutQuote = Object.fromEntries(["subtotal", "shippingFee", "discountAmount", "totalAmount"].map((key) => [key, quote[key]]));
    checkoutSignature = checkoutCartSignature + "|coupon=" + checkoutCouponCode;
    document.getElementById("checkout-coupon").value = checkoutCouponCode;
    feedback.textContent = checkoutCouponCode ? checkoutCouponCode + " applied. You save " + money(quote.discountAmount) + "." : "No coupon applied.";
    renderCheckoutQuote();
  } catch (error) { if (shoppingIdentity() === checkoutOwner) feedback.textContent = error.message + (checkoutCouponCode ? " Current coupon: " + checkoutCouponCode + "." : ""); }
  finally { couponBusy = false; if (shoppingIdentity() === checkoutOwner) ids.forEach((id) => document.getElementById(id).disabled = false); }
}

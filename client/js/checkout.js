document.addEventListener("DOMContentLoaded", async () => {
  await Api.ready;
  renderHeader();
  renderFooter();
  if (!requireLogin()) return;
  await loadCheckout();
});

async function loadCheckout() {
  const root = document.getElementById("checkout-root");
  try {
    const [cart, profile, paymentConfig, store] = await Promise.all([
      Api.get("/cart"),
      Api.get("/auth/profile"),
      Api.get("/payments/config"),
      getStoreConfig(),
    ]);
    const items = cart.items || [];
    if (items.some((item) => item.unavailable || !item.product || item.quantity > item.product.stock)) {
      root.innerHTML = `<div class="empty-state"><h2>Your cart needs a quick review</h2><p>An item or quantity is no longer available. Your selection has been kept.</p><a class="btn btn-primary" href="cart.html">Review cart</a></div>`;
      return;
    }
    checkoutSignature = JSON.stringify(items.map((item) => [item.product._id, item.quantity, item.price]));
    if (!items.length) {
      root.innerHTML = `<div class="empty-state spacious"><h2>Your cart is empty</h2><p>Add at least one product before checkout.</p><a class="btn btn-primary" href="products.html">Browse products</a></div>`;
      return;
    }

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = subtotal >= store.freeShippingThreshold ? 0 : store.flatShippingFee;
    const total = subtotal + shipping;
    const address = profile.address || {};

    root.innerHTML = `
      <div class="checkout-layout">
        <form id="checkout-form" class="checkout-form">
          <section class="checkout-card">
            <div class="checkout-card-head"><span>01</span><div><h2>Delivery details</h2><p>We will save these details to your profile for your next order.</p></div></div>
            <div id="checkout-alert" aria-live="polite"></div>
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
                <p class="gateway-note demo-notice"><strong>Demo checkout</strong> · Simulated payments only. No money is transferred.</p>
                <label class="payment-option selected">
                  <input type="radio" name="payment-method" value="demo_mobile_banking" checked />
                  <span class="payment-copy"><strong>Mobile Banking / bKash</strong><small>Try the mobile banking demo</small></span><span class="secure-chip">DEMO</span>
                </label>
                <label class="payment-option">
                  <input type="radio" name="payment-method" value="demo_card_bank" />
                  <span class="payment-copy"><strong>Card / Bank</strong><small>Try the card and bank payment demo</small></span><span class="secure-chip">DEMO</span>
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
                (item) => `<div><span>${escapeHtml(item.product.name)} <small>× ${item.quantity}</small></span><strong>${money(item.price * item.quantity)}</strong></div>`
              )
              .join("")}
          </div>
          <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
          <div class="summary-row"><span>Delivery</span><span>${shipping ? money(shipping) : "Free"}</span></div>
          <div class="summary-row summary-total"><span>Total</span><span>${money(total)}</span></div>
          <button type="submit" form="checkout-form" class="btn btn-primary btn-block" id="place-order-btn">Continue securely</button>
          <p class="summary-note">By continuing, you confirm that the delivery details are correct.</p>
        </aside>
      </div>
    `;

    bindCheckoutForm();
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><h2>Checkout unavailable</h2><p>${escapeHtml(error.message)}</p><a class="btn btn-primary" href="cart.html">Return to cart</a></div>`;
  }
}

function shippingPayload() {
  return {
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
    if (button.disabled) return;
    const alert = document.getElementById("checkout-alert");
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    button.disabled = true;
    button.textContent = paymentMethod.startsWith("demo_") ? "Opening demo payment…" : paymentMethod === "sslcommerz" ? "Opening secure payment…" : "Creating order…";
    alert.innerHTML = "";

    try {
      if (paymentMethod.startsWith("demo_")) {
        const result = await Api.post("/payments/demo/initiate", {
          shippingAddress: shippingPayload(), channel: paymentMethod.slice(5),
          checkoutKey: checkoutKey(paymentMethod),
        });
        clearCheckoutKey();
        window.location.assign(result.checkoutUrl);
        return;
      }
      if (paymentMethod === "sslcommerz") {
        const result = await Api.post("/payments/sslcommerz/initiate", {
          shippingAddress: shippingPayload(),
          checkoutKey: checkoutKey(paymentMethod),
        });
        clearCheckoutKey();
        window.location.assign(result.alreadyPaid ? "orders.html" : result.checkoutUrl);
        return;
      }
      const order = await Api.post("/orders", {
        shippingAddress: shippingPayload(),
        paymentMethod: "cod",
        checkoutKey: checkoutKey(paymentMethod),
      });
      clearCheckoutKey();
      const query = new URLSearchParams({
        placed: order._id,
        invoice: order.invoiceNumber || "",
      });
      window.location.href = "orders.html?" + query.toString();
    } catch (error) {
      if (error.orderId) {
        clearCheckoutKey();
        alert.innerHTML = `<div class="alert alert-warning"><strong>Your order is saved.</strong><p>${escapeHtml(error.message)}</p><p><a href="orders.html">View your order and payment status</a> before starting another checkout.</p></div>`;
        button.textContent = "Order saved — check My Orders";
        alert.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      } else {
        alert.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)}</div>`;
      }
      button.disabled = false;
      button.textContent = checkoutButtonLabel(paymentMethod);
      alert.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

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
  return method.startsWith("demo_") ? "Continue to demo payment" : method === "sslcommerz" ? "Continue to secure payment" : "Place cash-on-delivery order";
}

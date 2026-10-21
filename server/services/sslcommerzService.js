const httpError = require("../utils/httpError");

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");
const truncate = (value, max) => String(value || "").slice(0, max);

const isLive = () => process.env.SSLCOMMERZ_IS_LIVE === "true";

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (!isLive() && url.protocol === "http:");
  } catch {
    return false;
  }
};

const getBaseUrl = () =>
  isLive() ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com";

const isConfigured = () =>
  Boolean(
    process.env.SSLCOMMERZ_STORE_ID?.trim() &&
      process.env.SSLCOMMERZ_STORE_PASSWORD?.trim() &&
      isHttpUrl(process.env.SERVER_URL) &&
      isHttpUrl(process.env.CLIENT_APP_URL)
  );

const fetchWithTimeout = async (url, options, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const parseGatewayResponse = async (response) => {
  const raw = await response.text();
  if (!response.ok) throw httpError(502, "Payment gateway request failed");
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(502, "Payment gateway returned an invalid response");
  }
};

const ensureGatewayUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw httpError(502, "Payment gateway did not return a checkout URL");
  }
  const trustedHost =
    url.hostname === "sslcommerz.com" || url.hostname.endsWith(".sslcommerz.com");
  if (url.protocol !== "https:" || !trustedHost) {
    throw httpError(502, "Payment gateway returned an unsafe checkout URL");
  }
  return url.toString();
};

const createPaymentSession = async ({ order, invoice, user, transactionId }) => {
  if (!isConfigured()) {
    throw httpError(503, "SSLCOMMERZ is not configured on this server");
  }

  const serverUrl = trimTrailingSlash(process.env.SERVER_URL);
  const address = order.shippingAddress;
  const payload = new URLSearchParams({
    store_id: process.env.SSLCOMMERZ_STORE_ID,
    store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD,
    total_amount: order.totalAmount.toFixed(2),
    currency: order.currency,
    tran_id: transactionId,
    success_url: serverUrl + "/api/payments/sslcommerz/success",
    fail_url: serverUrl + "/api/payments/sslcommerz/fail",
    cancel_url: serverUrl + "/api/payments/sslcommerz/cancel",
    ipn_url: serverUrl + "/api/payments/sslcommerz/ipn",
    cus_name: truncate(user.name, 50),
    cus_email: truncate(user.email, 50),
    cus_add1: truncate(address.line1, 50),
    cus_add2: truncate(address.line2, 50),
    cus_city: truncate(address.city, 50),
    cus_state: truncate(address.district, 50),
    cus_postcode: truncate(address.postCode, 30),
    cus_country: truncate(address.country, 50),
    cus_phone: truncate(address.phone, 20),
    ship_name: truncate(user.name, 50),
    ship_add1: truncate(address.line1, 50),
    ship_add2: truncate(address.line2, 50),
    ship_city: truncate(address.city, 50),
    ship_state: truncate(address.district, 50),
    ship_postcode: truncate(address.postCode, 50),
    ship_country: truncate(address.country, 50),
    shipping_method: "YES",
    product_name: truncate(order.items.map((item) => item.name).join(", "), 255),
    product_category: "E-commerce",
    product_profile: "physical-goods",
    product_amount: order.subtotal.toFixed(2),
    value_a: order._id.toString(),
    value_b: invoice.invoiceNumber,
    value_c: user._id.toString(),
    value_d: "Norda",
  });

  const response = await fetchWithTimeout(getBaseUrl() + "/gwprocess/v4/api.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload,
  });
  const data = await parseGatewayResponse(response);

  if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
    throw httpError(502, data.failedreason || "Could not start SSLCOMMERZ checkout");
  }
  return {
    checkoutUrl: ensureGatewayUrl(data.GatewayPageURL),
    sessionKey: truncate(data.sessionkey, 100),
  };
};

const validatePayment = async (validationId) => {
  if (!isConfigured()) throw httpError(503, "SSLCOMMERZ is not configured");
  if (!validationId) throw httpError(400, "Missing payment validation ID");

  const query = new URLSearchParams({
    val_id: validationId,
    store_id: process.env.SSLCOMMERZ_STORE_ID,
    store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD,
    format: "json",
  });
  try {
    const response = await fetchWithTimeout(
      getBaseUrl() + "/validator/api/validationserverAPI.php?" + query.toString(),
      { method: "GET" }
    );
    return await parseGatewayResponse(response);
  } catch { throw httpError(502, "The payment could not be verified. Please try again later."); }
};

// Official transaction/session query API. Credentials stay on the server.
const queryPayment = async ({ transactionId, sessionKey }) => {
  if (!isConfigured()) throw httpError(503, "SSLCOMMERZ is not configured");
  const query = new URLSearchParams({ store_id: process.env.SSLCOMMERZ_STORE_ID, store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD, format: "json" });
  if (sessionKey) query.set("sessionkey", sessionKey);
  else query.set("tran_id", transactionId);
  let data;
  try {
    const response = await fetchWithTimeout(getBaseUrl() + "/validator/api/merchantTransIDvalidationAPI.php?" + query, { method: "GET" });
    data = await parseGatewayResponse(response);
  } catch { throw httpError(502, "The previous payment could not be checked. Please try again later."); }
  if (data.APIConnect !== "DONE") throw httpError(502, "The previous payment could not be checked. Please try again later.");
  return data;
};

const refundRequest = async (parameters) => {
  if (!isConfigured()) throw httpError(503, "SSLCOMMERZ is unavailable for refunds");
  const query = new URLSearchParams({ store_id: process.env.SSLCOMMERZ_STORE_ID, store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD, format: "json", ...parameters });
  try {
    return await parseGatewayResponse(await fetchWithTimeout(getBaseUrl() + "/validator/api/merchantTransIDvalidationAPI.php?" + query, { method: "GET" }));
  } catch { throw httpError(502, "The refund gateway could not be reached. Its financial result must be reconciled before another attempt."); }
};
const initiateRefund = (refund) => refundRequest({
  bank_tran_id: refund.bankTransactionId, refund_trans_id: refund.transactionId,
  refund_amount: Number(refund.amount).toFixed(2), refund_remarks: String(refund.reason).slice(0, 255),
  refe_id: String(refund._id), v: "1",
});
const queryRefund = (refundReference) => refundRequest({ refund_ref_id: refundReference });

const verifyPaymentForOrder = (result, payment) => {
  const validStatus = result.status === "VALID" || result.status === "VALIDATED";
  const sameTransaction = result.tran_id === payment.transactionId;
  const sameAmount = Math.abs(Number(result.amount) - Number(payment.amount)) < 0.01;
  const sourceCurrency = result.currency_type || result.currency;
  const sameCurrency = sourceCurrency === payment.currency;
  const parsedRisk = Number(result.risk_level ?? 0);
  const riskLevel = Number.isFinite(parsedRisk) ? parsedRisk : -1;

  return {
    valid: validStatus && sameTransaction && sameAmount && sameCurrency && riskLevel === 0,
    validStatus,
    sameTransaction,
    sameAmount,
    sameCurrency,
    riskLevel,
  };
};

module.exports = {
  createPaymentSession,
  ensureGatewayUrl,
  getBaseUrl,
  isConfigured,
  isHttpUrl,
  isLive,
  validatePayment,
  queryPayment,
  initiateRefund,
  queryRefund,
  verifyPaymentForOrder,
};

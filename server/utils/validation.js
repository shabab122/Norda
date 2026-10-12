const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cleanText = (value, maxLength = 255) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const isValidEmail = (value) => EMAIL_PATTERN.test(cleanText(value, 254).toLowerCase());

const isPositiveInteger = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;

const effectivePrice = (product) =>
  product.discountPrice > 0 && product.discountPrice < product.price ? Number(product.discountPrice) : Number(product.price);

const pagination = (query, defaultLimit = 20) => ({
  page: Number.isSafeInteger(Number(query.page)) && Number(query.page) > 0 ? Number(query.page) : 1,
  limit: Number.isSafeInteger(Number(query.limit)) && Number(query.limit) > 0 ? Math.min(Number(query.limit), 100) : defaultLimit,
});

const escapeRegExp = (value) => value.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&");

const cleanAssetUrl = (value) => {
  const clean = cleanText(value, 500);
  if (!clean) return "";
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(clean)) return clean;
  if (/^\/assets\/products\/[a-zA-Z0-9._-]+\.svg$/.test(clean)) return clean;
  try {
    const url = new URL(clean);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
};

module.exports = { cleanAssetUrl, cleanText, effectivePrice, isValidEmail, isPositiveInteger, escapeRegExp, pagination };

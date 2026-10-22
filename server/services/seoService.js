const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const Product = require("../models/Product");
const { effectivePrice } = require("../utils/validation");
const httpError = require("../utils/httpError");
const xml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const plain = (v, max = 160) => String(v || "").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
function siteUrl() {
  const value = process.env.SITE_URL || process.env.CLIENT_APP_URL || process.env.SERVER_URL || "http://localhost:" + (process.env.PORT || 5000);
  try { const u = new URL(value); if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || u.search || u.hash || u.pathname !== "/" || (process.env.NODE_ENV === "production" && u.protocol !== "https:")) return null; return u.origin; } catch { return null; }
}
const indexable = (base = siteUrl()) => { if (!base) return false; const u = new URL(base); return u.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && !/\.local$/.test(u.hostname); };
function assetUrl(value, base) { try { const u = new URL(value, base); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? u.href : ""; } catch { return ""; } }
function productMetadata(product, base) {
  const url = base + "/product-detail.html?id=" + product._id;
  const name = plain(product.name, 140), description = plain(product.description) || "Shop " + name + " at Norda. View current prices, product options and availability.";
  const variants = (product.variants || []).filter((v) => v.isActive !== false), prices = (variants.length ? variants : [product]).map(effectivePrice).filter((p) => Number.isFinite(p) && p > 0);
  const images = [...new Set([...(product.images || []), ...variants.flatMap((v) => v.images || [])].map((i) => assetUrl(i, base)).filter(Boolean))].slice(0, 12);
  const available = !product.isArchived && (variants.length ? variants.some((v) => v.stock > 0) : product.stock > 0);
  const offers = prices.length ? variants.length ? { "@type": "AggregateOffer", priceCurrency: "BDT", lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: variants.length, url } : { "@type": "Offer", priceCurrency: "BDT", price: prices[0].toFixed(2), availability: "https://schema.org/" + (available ? "InStock" : "OutOfStock"), itemCondition: "https://schema.org/NewCondition", url } : undefined;
  const data = { "@context": "https://schema.org", "@type": "Product", "@id": url + "#product", name, description, image: images, url, ...(product.brand ? { brand: { "@type": "Brand", name: plain(product.brand, 80) } } : {}), ...(offers && !product.isArchived ? { offers } : {}) };
  if (product.ratingCount > 0 && product.ratingAverage >= 1 && product.ratingAverage <= 5) data.aggregateRating = { "@type": "AggregateRating", ratingValue: Number(product.ratingAverage.toFixed(2)), reviewCount: product.ratingCount, bestRating: 5, worstRating: 1 };
  return { title: name + " — Norda", description, url, image: images[0], data, index: !product.isArchived && indexable(base) };
}
function injectHead(html, meta, nonce = "") {
  const head = html.match(/<head>[^]*?<\/head>/i)?.[0]; if (!head) return html;
  let cleaned = head.replace(/<title>[^]*?<\/title>/gi, "").replace(/<meta\b[^>]*(?:name=["'](?:description|robots)["']|property=["']og:[^"']+["'])[^>]*>/gi, "").replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "");
  const tags = [`<title>${xml(meta.title)}</title>`, `<meta name="description" content="${xml(meta.description)}" />`, `<meta name="robots" content="${meta.index ? "index,follow" : "noindex,follow"}" />`, meta.url ? `<link rel="canonical" href="${xml(meta.url)}" />` : "", `<meta property="og:type" content="${meta.data ? "product" : "website"}" />`, `<meta property="og:title" content="${xml(meta.title)}" />`, `<meta property="og:description" content="${xml(meta.description)}" />`, meta.url ? `<meta property="og:url" content="${xml(meta.url)}" />` : "", meta.image ? `<meta property="og:image" content="${xml(meta.image)}" />` : "", meta.data ? `<script type="application/ld+json" nonce="${nonce}">${JSON.stringify(meta.data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")}</script>` : ""].filter(Boolean).join("\n");
  cleaned = cleaned.replace(/<\/head>/i, tags + "\n</head>"); return html.replace(head, cleaned);
}
const pages = [{ file: "index.html", title: "Norda — Everyday favourites", description: "Discover Norda's considered collection of fashion, electronics, home essentials and everyday favourites." }, { file: "products.html", title: "Shop the collection — Norda", description: "Browse Norda products, explore categories and choose the size or color that suits you." }, { file: "coupons.html", title: "Offers & savings — Norda", description: "Explore current Norda offers and coupon terms before checkout." }, { file: "help.html", title: "Contact, delivery & returns — Norda", description: "Find Norda contact details, FAQs, delivery information and store policies." }];
const privatePage = (p) => /^\/(?:admin(?:\/|$)|(?:cart|checkout|login|register|dashboard|profile|orders|invoice|security|wishlist|order-support|order-tracking|item-returns|credit-note|forgot-password|reset-password|verify-email|demo-payment|payment-result)(?:\.html)?(?:\/|$))/.test(p);
function privateRobots(req, res, next) { if (/^\/(authenticator|staff-invitation)(?:\.html)?$/.test(req.path)) res.set("X-Robots-Tag", "noindex,nofollow,noarchive"); if (privatePage(req.path)) res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive"); next(); }
const router = require("express").Router();
router.get("/robots.txt", (req, res) => { const base = siteUrl(); res.type("text/plain").send(indexable(base) ? "User-agent: *\nDisallow: /api/\nDisallow: /admin/\n" + ["authenticator", "staff-invitation", "cart", "checkout", "login", "register", "dashboard", "profile", "orders", "invoice", "security", "wishlist", "order-support", "order-tracking", "item-returns", "credit-note", "forgot-password", "reset-password", "verify-email", "demo-payment", "payment-result"].map((p) => "Disallow: /" + p + ".html").join("\n") + "\nSitemap: " + base + "/sitemap.xml\n" : "User-agent: *\nDisallow: /\n"); });
router.get("/sitemap.xml", async (req, res, next) => { try { const base = siteUrl(); if (!indexable(base)) throw httpError(503, "Configure the public HTTPS SITE_URL before publishing the sitemap"); const count = await Product.countDocuments({ isArchived: { $ne: true } }); const total = Math.ceil(count / 1000); if (total > 49999) throw httpError(503, "Catalog requires a larger sitemap partition"); res.type("application/xml").send('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ["/sitemaps/pages.xml", ...Array.from({ length: total }, (_, i) => "/sitemaps/products-" + (i + 1) + ".xml")].map((p) => "<sitemap><loc>" + xml(base + p) + "</loc></sitemap>").join("") + "</sitemapindex>"); } catch (e) { next(e); } });
router.get("/sitemaps/:part", async (req, res, next) => { try {
  const base = siteUrl(); if (!indexable(base)) throw httpError(503, "Configure the public HTTPS SITE_URL before publishing the sitemap"); let rows;
  if (req.params.part === "pages.xml") rows = pages.map((p) => ({ url: base + (p.file === "index.html" ? "/" : "/" + p.file) }));
  else { const m = req.params.part.match(/^products-([1-9]\d{0,4})\.xml$/); if (!m || Number(m[1]) > 49999) throw httpError(404, "Sitemap not found"); const found = await Product.find({ isArchived: { $ne: true } }).sort({ _id: 1 }).skip((Number(m[1]) - 1) * 1000).limit(1000).select("_id updatedAt").lean(); if (!found.length) throw httpError(404, "Sitemap not found"); rows = found.map((p) => ({ url: base + "/product-detail.html?id=" + p._id, date: p.updatedAt })); }
  res.type("application/xml").send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + rows.map((r) => "<url><loc>" + xml(r.url) + "</loc>" + (r.date && Number.isFinite(+new Date(r.date)) ? "<lastmod>" + new Date(r.date).toISOString() + "</lastmod>" : "") + "</url>").join("") + "</urlset>");
} catch (e) { next(e); } });
router.get(["/product-detail.html", "/product-detail"], async (req, res, next) => { try {
  let html = await fs.readFile(path.join(__dirname, "../../client/product-detail.html"), "utf8"); const base = siteUrl();
  if (req.query.id === undefined) return res.set("X-Robots-Tag", "noindex,follow").type("html").send(injectHead(html, { title: "Product — Norda", description: "View product details at Norda.", index: false }));
  if (typeof req.query.id !== "string" || !/^[a-f0-9]{24}$/i.test(req.query.id)) return res.status(400).set("X-Robots-Tag", "noindex").type("html").send(injectHead(html, { title: "Product unavailable — Norda", description: "Choose a product from the Norda catalog.", index: false }));
  const product = await Product.findById(req.query.id).lean();
  if (!product) return res.status(404).set("X-Robots-Tag", "noindex").type("html").send(injectHead(html, { title: "Product not found — Norda", description: "This product is unavailable.", index: false }));
  const nonce = crypto.randomBytes(18).toString("base64"), meta = productMetadata(product, base || "http://localhost:5000");
  const policy = String(res.getHeader("Content-Security-Policy") || ""); res.setHeader("Content-Security-Policy", policy.replace(/script-src[^;]*/, (s) => s + " 'nonce-" + nonce + "'"));
  if (!meta.index) res.setHeader("X-Robots-Tag", "noindex,follow");
  res.status(product.isArchived ? 410 : 200).type("html").send(injectHead(html, meta, nonce));
} catch (e) { res.setHeader("X-Robots-Tag", "noindex"); next(e); } });
router.get(["/", ...pages.flatMap((p) => ["/" + p.file, "/" + p.file.replace(".html", "")])], async (req, res, next) => { try { const file = req.path === "/" ? "index.html" : req.path.slice(1).replace(/(?:\.html)?$/, ".html"), page = pages.find((p) => p.file === file); if (!page) return next(); const base = siteUrl(); const html = await fs.readFile(path.join(__dirname, "../../client/", file), "utf8"); res.type("html").send(injectHead(html, { ...page, url: base ? base + (file === "index.html" ? "/" : "/" + file) : "", index: indexable(base) })); } catch (e) { next(e); } });
module.exports = { router, privateRobots, siteUrl, indexable, productMetadata, injectHead, xml };

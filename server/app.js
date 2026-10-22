const path = require("path");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const express = require("express");
const mongoSanitize = require("express-mongo-sanitize");
const helmet = require("helmet");
const hpp = require("hpp");
const rateLimit = require("express-rate-limit");

const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/authRoutes");
const brandRoutes = require("./routes/brandRoutes");
const cartRoutes = require("./routes/cartRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const productRoutes = require("./routes/productRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const storeRoutes = require("./routes/storeRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const app = express();
app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

const allowedOrigins = String(process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
// Gateway form redirects/IPN are cross-origin server notifications; browser
// CORS rules apply to storefront API calls, not these validated callbacks.
app.use((req, res, next) => {
  const gatewayCallback = /^\/api\/payments\/sslcommerz\/(success|fail|cancel|ipn)$/.test(req.path);
  cors({
    origin(origin, callback) {
      if (gatewayCallback) return callback(null, false);
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
      const error = new Error("Origin is not allowed"); error.statusCode = 403; return callback(error);
    },
    credentials: true,
  })(req, res, next);
});
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: { directives: { "img-src": ["'self'", "https:", "data:", "blob:", ...(process.env.NODE_ENV === "production" ? [] : ["http:"])] } },
}));
app.use((req, res, next) => { req.requestId = require("node:crypto").randomUUID(); res.setHeader("X-Request-ID", req.requestId); next(); });
app.use(cookieParser());
app.use(express.json({ limit: "1mb", verify(req, res, buffer) { if (req.originalUrl.split("?")[0] === "/api/mail/delivery-events") req.rawMailBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(mongoSanitize());
app.use(hpp());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." },
});

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "norda-api" }));
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api", apiLimiter);
app.use("/api", require("./services/maintenanceService").writeMiddleware);
app.use("/api", (req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

app.get("/uploads/:filename", require("./services/mediaService").legacyRedirect);
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { fallthrough: false }));
app.post("/api/mail/delivery-events", async (req, res, next) => { try { const s = require("./services/notificationDeliveryService"); s.verifyWebhook(req); res.json(await s.recordDelivery(req.body)); } catch (e) { next(e); } });
app.use("/api", require("./routes/productionToolsRoutes"));
app.use("/api/auth", authRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/store", storeRoutes);
app.use("/api", require("./routes/commerceToolsRoutes"));
app.use("/api", require("./routes/itemReturnRoutes"));
app.use("/api/uploads", uploadRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", require("./routes/managementRoutes"));
app.use("/api/admin/operations", require("./routes/orderOperationsRoutes"));
app.use("/api/admin/notifications", require("./routes/notificationRoutes"));

app.use(require("./services/seoService").privateRobots);
app.use(require("./services/seoService").router);
app.use(express.static(path.join(__dirname, "..", "client"), { extensions: ["html"], maxAge: 0 }));
app.use(notFound);
app.use(errorHandler);

module.exports = app;

const router = require("express").Router();
const { protect, authorize } = require("../middleware/auth");
const guest = require("../services/guestService"), fulfillment = require("../services/fulfillmentService"), settlement = require("../services/settlementService"), stock = require("../services/stockWatchService"), returns = require("../services/returnLogisticsService"), exchange = require("../services/exchangePaymentService");
const { ownedOrder, objectId } = require("../services/orderOperationStore");
const { pagination } = require("../utils/validation");
const error = require("../utils/httpError");
const handle = (fn, status = 200) => async (req, res, next) => { try { const value = await fn(req, res); if (!res.headersSent) res.status(status).json(value); } catch (e) { next(e); } };
const guestLimit = require("express-rate-limit")({ windowMs: 900000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Too many guest session requests. Please try again later." } });
router.get("/guest/session", handle(async req => { const current = await guest.active(req, false); return current ? guest.view(current.row, current.user) : { active: false }; }));
router.post("/guest/session", guestLimit, handle((req, res) => guest.ensure(req, res), 201));
router.post("/guest/contact", guest.guestOnly, handle(req => guest.contact(req)));
router.post("/guest/recovery", guestLimit, handle(req => guest.requestRecovery(req.body)));
router.post("/guest/recover", guestLimit, handle((req, res) => guest.recover(req.body, res)));
router.post("/guest/merge-cart", protect, handle(req => guest.mergeCart(req)));
router.post("/guest/claim", protect, handle((req, res) => guest.claimOrders(req, res)));
router.get("/guest/orders", guest.guestOnly, handle(async req => (await require("../models/Order").find({ user: req.user._id }).sort({ createdAt: -1 })).map(require("../services/orderView").orderView)));
const guestCart = require("../controllers/cartController");
router.get("/guest/cart", guest.guestOnly, guestCart.getCart);
router.delete("/guest/cart/:itemId", guest.guestOnly, guestCart.removeCartItem);
router.get("/guest/invoices/order/:orderId", guest.guestOnly, require("../controllers/invoiceController").getInvoiceByOrder);

router.get("/stock-alerts", protect, handle(req => stock.list(req.user)));
router.post("/stock-alerts", protect, handle(req => stock.subscribe(req.user, req.body), 201));
router.delete("/stock-alerts/:id", protect, handle(req => stock.remove(req.user, req.params.id)));
router.post("/stock-alerts/unsubscribe", guestLimit, handle(req => stock.unsubscribe(req.body)));

router.get("/admin/fulfillment/policy", protect, authorize("inventory"), handle(async () => ({ policy: await fulfillment.policy(), warehouses: await require("../models/Warehouse").find({}).sort({ name: 1 }) })));
router.put("/admin/fulfillment/policy", protect, authorize("inventory"), handle(req => fulfillment.savePolicy(req.user, req.body)));
router.get("/orders/:id/parcels", guest.shopper, handle(async req => { await ownedOrder(req.params.id, req.user, null, "orders"); return require("../models/FulfillmentParcel").find({ order: req.params.id }).sort({ createdAt: 1 }); }));
router.get("/admin/fulfillment/parcels", protect, authorize("orders"), handle(async req => {
  const { page, limit } = pagination(req.query), filter = {};
  if (req.query.orderId) { objectId(req.query.orderId); filter.order = req.query.orderId; }
  if (req.query.status) { if (!["pending", "processing", "shipped", "delivered", "cancelled"].includes(req.query.status)) throw error(400, "Invalid parcel status"); filter.status = req.query.status; }
  const Model = require("../models/FulfillmentParcel"), total = await Model.countDocuments(filter); return { items: await Model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), total, page, pages: Math.ceil(total / limit) || 1 };
}));
router.post("/admin/fulfillment/parcels/:id/status", protect, authorize("orders"), handle(req => fulfillment.updateParcel(req.params.id, req.user, req.body)));

router.get("/admin/settlements", protect, authorize("payments"), handle(req => settlement.report(req.query)));
router.get("/admin/settlements/template.csv", protect, authorize("payments"), (req, res) => res.type("text/csv").attachment("norda-settlements.csv").send(settlement.template()));
router.post("/admin/settlements/preview", protect, authorize("payments"), handle(req => settlement.preview(req.body.csv)));
router.post("/admin/settlements/import", protect, authorize("payments"), handle(req => settlement.apply(req.user, req.body), 201));
router.post("/admin/settlements/:id/resolve", protect, authorize("payments"), handle(req => settlement.resolve(req.user, req.params.id, req.body)));
router.get("/admin/settlements/export.csv", protect, authorize("payments"), handle(async (req, res) => {
  const rows = await require("../models/SettlementEntry").find({}).sort({ settledAt: -1 }).limit(10000), { escapeCsvCell: cell } = require("../utils/csv");
  const columns = ["kind", "provider", "reference", "order", "transactionId", "refundId", "gross", "fee", "net", "currency", "settledAt", "status", "reason"];
  res.type("text/csv").attachment("norda-settlement-ledger.csv").send([columns.join(","), ...rows.map(r => columns.map(k => cell(k === "settledAt" ? new Date(r[k]).toISOString() : r[k] ?? "")).join(","))].join("\r\n") + "\r\n");
}));

router.get("/orders/:id/pickups", guest.shopper, handle(req => returns.list(req.params.id, req.user)));
router.post("/orders/:id/pickups", guest.shopper, handle(req => returns.requestPickup(req.params.id, req.user, req.body), 201));
router.get("/admin/return-pickups", protect, authorize("orders"), handle(async req => {
  const { page, limit } = pagination(req.query), filter = {};
  if (req.query.orderId) { objectId(req.query.orderId); filter.order = req.query.orderId; }
  const total = await require("../models/ReturnPickup").countDocuments(filter); return { items: await require("../models/ReturnPickup").find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), total, page, pages: Math.ceil(total / limit) || 1 };
}));
router.post("/admin/return-pickups/:id/status", protect, authorize("orders"), handle(req => returns.updatePickup(req.params.id, req.user, req.body)));
router.get("/orders/exchanges/:id/receipts", guest.shopper, handle(async req => { const item = await require("../models/ItemReturnCase").findById(objectId(req.params.id)); if (!item) throw error(404, "Item request not found"); await ownedOrder(item.order, req.user, null, "payments"); return require("../models/ReturnReceipt").find({ itemCase: item._id }).sort({ createdAt: 1 }); }));

router.get("/orders/exchanges/:id/payment", guest.shopper, handle(req => exchange.details(req.params.id, req.user)));
router.post("/orders/exchanges/:id/payment", guest.shopper, handle(req => exchange.start(req.params.id, req.user, req.body), 201));
router.post("/orders/exchanges/:id/payment/simulate", guest.shopper, handle(req => exchange.record(req.params.id, req.user, req.body, true), 201));
router.post("/admin/exchanges/:id/payment", protect, authorize("payments"), handle(req => exchange.record(req.params.id, req.user, req.body), 201));
router.get("/admin/exchanges/:id/payments", protect, authorize("payments"), handle(async req => { await exchange.details(req.params.id, req.user); return require("../models/ExchangePayment").find({ itemCase: req.params.id }).sort({ createdAt: -1 }); }));
router.post("/admin/exchange-payments/:id/resolve", protect, authorize("payments"), handle(req => exchange.resolve(req.params.id, req.user, req.body)));

function resultUrl(id, status) { const base = process.env.CLIENT_APP_URL || "http://localhost:5000"; const url = new URL("exchange-payment.html", base.replace(/\/?$/, "/")); if (id) url.searchParams.set("id", id); url.searchParams.set("result", status); return url.href; }
for (const outcome of ["success", "ipn", "fail", "cancel"]) router.post("/exchange-payments/sslcommerz/" + outcome, async (req, res) => {
  try {
    if (["success", "ipn"].includes(outcome)) {
      const result = await exchange.validate(req.body.tran_id, req.body.val_id);
      if (outcome === "ipn") return res.status(result.ok ? 200 : 400).json({ accepted: Boolean(result.ok) });
      return res.redirect(303, resultUrl(result.itemCase, result.review ? "review" : result.ok ? "success" : "pending"));
    }
    const payment = await exchange.fail(req.body.tran_id, outcome === "cancel" ? "cancelled" : "failed"); return res.redirect(303, resultUrl(payment?.itemCase, payment?.status === "paid" ? "success" : outcome));
  } catch { if (outcome === "ipn") return res.status(503).json({ accepted: false }); return res.redirect(303, resultUrl(null, "pending")); }
});
module.exports = router;

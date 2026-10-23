const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { shopper: protect } = require("../services/guestService");
const s = require("../services/itemReturnService");
const { pagination } = require("../utils/validation");
const { objectId } = require("../services/orderOperationStore");
const handle = (fn, status = 200) => async (req, res, next) => { try { const result = await fn(req); res.status(status).json(result); } catch (e) { next(e); } };
router.use(protect);
router.get("/orders/:id/item-returns", handle((req) => s.customerCases(req.params.id, req.user)));
router.post("/orders/:id/item-returns", handle((req) => s.createCase({ orderId: req.params.id, user: req.user, body: req.body }), 201));
router.get("/admin/item-returns", authorize("payments"), handle(async (req) => {
  const { page, limit } = pagination(req.query); const filter = {};
  if (req.query.status) { if (!["requested", "approved", "receiving", "rejected", "received", "ready", "shipped", "completed"].includes(req.query.status)) throw require("../utils/httpError")(400, "Invalid item request status"); filter.status = req.query.status; }
  if (req.query.orderId) { objectId(req.query.orderId); filter.order = req.query.orderId; }
  const Case = require("../models/ItemReturnCase");
  const [rows, total] = await Promise.all([Case.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Case.countDocuments(filter)]);
  const items = [];
  for (const c of rows) { const refund = c.refund ? await require("../models/Refund").findById(c.refund) : null; const user = await require("../models/User").findById(c.user); items.push({ ...s.safeCase(c), customer: user ? { name: user.name, email: user.email } : null, refundDetails: refund ? { _id: refund._id, status: refund.status, gateway: refund.gateway, amount: refund.amount, failureReason: refund.failureReason || "" } : null }); }
  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
}));
for (const [route, method] of [["decision", "decideCase"], ["receive", "receiveCase"], ["shipment", "shipExchange"], ["retry-refund", "retryCaseRefund"]]) router.post("/admin/item-returns/:id/" + route, authorize("payments"), handle((req) => s[method]({ id: req.params.id, user: req.user, body: req.body })));
router.get("/credit-notes/:id", handle(async (req) => {
  objectId(req.params.id); const credit = await require("../models/CreditNote").findById(req.params.id);
  if (!credit) throw require("../utils/httpError")(404, "Credit note not found");
  if (String(credit.user) !== String(req.user._id) && !require("../utils/permissions").hasPermission(req.user, "payments") && !require("../utils/permissions").hasPermission(req.user, "orders")) throw require("../utils/httpError")(403, "This credit note belongs to another customer");
  return credit;
}));
module.exports = router;

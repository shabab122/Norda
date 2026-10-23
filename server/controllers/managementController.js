const User = require("../models/User");
const Order = require("../models/Order");
const StaffAudit = require("../models/StaffAudit");
const { SCOPES } = require("../utils/permissions");
const { pagination, escapeRegExp } = require("../utils/validation");
const { objectId, noteText, patch } = require("../services/orderOperationStore");
const { withOperationLock } = require("../services/operationLock");
const { withDatabaseUnit, insertDocument } = require("../services/databaseUnit");
const httpError = require("../utils/httpError");
const handle = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };
const safeUser = (u) => ({ _id: u._id, name: u.name, email: u.isGuest ? u.guestEmail || "" : u.email, isGuest: Boolean(u.isGuest), role: u.role, permissions: u.role === "staff" ? [...(u.permissions || [])] : [], emailVerified: Boolean(u.emailVerifiedAt), createdAt: u.createdAt });
exports.listCustomers = handle(async (req) => {
  const { page, limit } = pagination(req.query); const filter = { role: "user" };
  if (req.query.q) { if (typeof req.query.q !== "string" || req.query.q.length > 100) throw httpError(400, "Search must be at most 100 characters"); const re = { $regex: escapeRegExp(req.query.q.trim()), $options: "i" }; filter.$or = [{ name: re }, { email: re }, { guestEmail: re }]; }
  filter.$and = [{ $or: [{ isGuest: { $ne: true } }, { guestEmail: { $exists: true, $ne: "" } }] }];
  const [rows, total] = await Promise.all([User.find(filter).sort({ createdAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit), User.countDocuments(filter)]);
  return { items: rows.map(safeUser), total, page, pages: Math.ceil(total / limit) || 1 };
});
exports.customerHistory = handle(async (req) => {
  objectId(req.params.id); const user = await User.findById(req.params.id);
  if (!user || user.role !== "user") throw httpError(404, "Customer not found");
  const { page, limit } = pagination(req.query);
  const [rows, total] = await Promise.all([Order.find({ user: user._id }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Order.countDocuments({ user: user._id })]);
  return { customer: safeUser(user), items: rows.map((o) => ({ _id: o._id, createdAt: o.createdAt, items: o.items.map((i) => ({ name: i.name, sku: i.sku, quantity: i.quantity })), status: o.status, paymentStatus: o.paymentStatus, totalAmount: o.totalAmount, currency: o.currency, refundedAmount: o.refundedAmount || 0 })), page, total, pages: Math.ceil(total / limit) || 1 };
});
exports.listStaff = handle(async () => ({ scopes: SCOPES, items: (await User.find({ role: { $in: ["staff", "admin"] } }).sort({ name: 1 }).limit(300)).map(safeUser) }));
exports.saveStaff = handle(async (req) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || !["user", "staff"].includes(req.body.role) || !Array.isArray(req.body.permissions) || req.body.permissions.some((s) => !SCOPES.includes(s)) || new Set(req.body.permissions).size !== req.body.permissions.length) throw httpError(400, "Choose an existing account, staff/customer role and valid permissions");
  const note = noteText(req.body.note);
  return withOperationLock("staff-management", () => withDatabaseUnit(async (unit) => {
    const user = await require("../services/databaseUnit").querySession(User.findOne({ email }), unit.session);
    if (!user || user.isGuest) throw httpError(404, "This person must register a normal account before you grant staff access");
    if (user.role === "admin" || String(user._id) === String(req.user._id)) throw httpError(403, "Administrator access cannot be edited here");
    const permissions = req.body.role === "staff" ? [...req.body.permissions].sort() : [];
    const updated = await patch(User, user, { role: req.body.role, permissions, ...(req.body.role === "user" ? { staffMfaRequired: false } : {}) }, unit);
    const event = await insertDocument(StaffAudit, { actor: req.user._id, target: user._id, previousRole: user.role, role: updated.role, previousPermissions: [...(user.permissions || [])], permissions, note }, unit.session);
    unit.compensate(() => StaffAudit.deleteOne({ _id: event._id }));
    return safeUser(updated);
  }));
});
exports.staffHistory = handle(async (req) => { const { page, limit } = pagination(req.query); const [items, total] = await Promise.all([StaffAudit.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("actor", "name email").populate("target", "name email"), StaffAudit.countDocuments({})]); return { items, total, page, pages: Math.ceil(total / limit) || 1 }; });

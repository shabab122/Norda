const crypto = require("node:crypto");
const User = require("../models/User"), Session = require("../models/GuestSession"), Recovery = require("../models/GuestRecovery");
const Order = require("../models/Order"), Cart = require("../models/Cart");
const error = require("../utils/httpError");
const { hash, text } = require("../utils/expansion");
const { isValidEmail } = require("../utils/validation");
const { withOperationLock } = require("./operationLock");
const { withDatabaseUnit, insertDocument: insert, querySession: qs } = require("./databaseUnit");
const { patch } = require("./orderOperationStore");
const cookieName = "norda_guest";
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
const view = (session, user) => ({ active: true, id: String(user._id), expiresAt: session.expiresAt, name: user.name, email: user.guestEmail || "" });
async function active(req, required = true) {
  const token = req.cookies?.[cookieName];
  const row = /^[a-f0-9]{64}$/.test(token || "") ? await Session.findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } }) : null;
  const user = row ? await User.findById(row.user) : null;
  if (!row || !user?.isGuest || row.claimedBy) { if (required) throw error(401, "Your guest shopping session expired. Recover the order using its email, or start a new guest cart."); return null; }
  if (req.get?.("X-Norda-Guest-ID") && req.get("X-Norda-Guest-ID") !== String(user._id)) throw error(409, "Guest shopping identity changed; refresh before continuing");
  return { row, user };
}
async function issue(user, res) {
  const token = crypto.randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 30 * 86400000);
  const row = await Session.create({ user: user._id, tokenHash: hash(token), expiresAt });
  res.cookie(cookieName, token, { ...cookieOptions(), expires: expiresAt });
  return view(row, user);
}
async function ensure(req, res) {
  const current = await active(req, false); if (current) return view(current.row, current.user);
  const id = crypto.randomBytes(16).toString("hex");
  const user = await User.create({ name: "Guest shopper", email: "guest-" + id + "@guest.norda.invalid", password: crypto.randomBytes(40).toString("base64url"), isGuest: true, guestEmail: "", role: "user", notificationPreferences: { orderUpdates: true, returnUpdates: true, refundUpdates: true } });
  try { return await issue(user, res); } catch (e) { await User.deleteOne({ _id: user._id }); throw e; }
}
async function contact(req) {
  const { row, user } = await active(req), name = text(req.body.name, 80), email = String(req.body.email || "").trim().toLowerCase();
  if (!isValidEmail(email) || email.endsWith(".invalid")) throw error(400, "Provide a valid order contact email");
  return withOperationLock("guest:" + user._id, async () => {
    await active(req);
    const current = await User.findById(user._id);
    if (current.guestEmail && current.guestEmail !== email && await Order.exists({ user: user._id })) throw error(409, "This guest session already has orders for another email. Keep that email or use a separate browser profile.");
    const updated = await User.findByIdAndUpdate(user._id, { $set: { name, guestEmail: email } }, { new: true });
    return view(row, updated);
  });
}
async function guestOnly(req, res, next) {
  try { const found = await active(req); req.user = found.user; req.guestSession = found.row; next(); } catch (e) { next(e); }
}
function shopper(req, res, next) {
  if (req.get("X-Norda-Guest") !== "1" && (req.cookies?.norda_token || req.headers.authorization)) return require("../middleware/auth").protect(req, res, next);
  return guestOnly(req, res, next);
}
async function mergeCart(req) {
  if (req.user.isGuest) throw error(403, "Sign in to merge your guest cart");
  const guest = await active(req, false); if (!guest) return { merged: false };
  const ids = [String(guest.user._id), String(req.user._id)].sort();
  return withOperationLock("cart:" + ids[0], () => withOperationLock("cart:" + ids[1], () => withDatabaseUnit(async unit => {
    await active(req);
    const from = await qs(Cart.findOne({ user: guest.user._id }), unit.session); if (!from?.items?.length) return { merged: false };
    let to = await qs(Cart.findOne({ user: req.user._id }), unit.session);
    const items = (to?.items || []).map(i => i.toObject?.() || { ...i });
    for (const line of from.items) {
      const product = await qs(require("../models/Product").findById(line.product), unit.session);
      if (!product) throw error(409, "A guest cart product is unavailable; review the guest cart before merging");
      const [available] = await require("./fulfillmentService").enrich([product], unit.session);
      const selected = require("./inventoryService").selection(available, line.variantId);
      const same = items.find(i => String(i.product) === String(line.product) && String(i.variantId || "") === String(line.variantId || ""));
      const quantity = line.quantity + (same?.quantity || 0);
      if (quantity > selected.stock || !Number.isSafeInteger(quantity)) throw error(409, "Guest cart cannot be merged until unavailable quantities are reviewed. Both carts were kept.");
      if (same) { same.quantity = quantity; same.price = selected.price; } else items.push({ product: line.product, quantity, ...selected });
    }
    if (to) await patch(Cart, to, { items }, unit);
    else { to = await insert(Cart, { user: req.user._id, items }, unit.session); unit.compensate(() => Cart.deleteOne({ _id: to._id })); }
    await patch(Cart, from, { items: [] }, unit); return { merged: true, count: items.length };
  })));
}
async function claimOrders(req, res) {
  if (req.body.confirmed !== true || req.user.isGuest || !req.user.emailVerifiedAt) throw error(409, "Verify your account email and explicitly confirm linking these guest orders");
  const guest = await active(req);
  if (!guest.user.guestEmail || guest.user.guestEmail.toLowerCase() !== req.user.email.toLowerCase()) throw error(403, "Use the verified account matching the guest order contact email");
  const result = await withOperationLock("guest:" + guest.user._id, () => withOperationLock("cart:" + guest.user._id, async () => {
    await active(req);
    const references = await Order.find({ user: guest.user._id }).sort({ _id: 1 }).limit(201);
    if (references.length > 200) throw error(409, "Contact customer care to link this large guest history");
    const lockOrders = (index, work) => index === references.length ? work() : withOperationLock("order:" + references[index]._id, () => lockOrders(index + 1, work));
    return lockOrders(0, () => withDatabaseUnit(async unit => {
    const cart = await qs(Cart.findOne({ user: guest.user._id }), unit.session); if (cart?.items?.length) throw error(409, "Merge or clear the guest cart before linking its orders");
    const orders = await qs(Order.find({ user: guest.user._id }), unit.session);
    if (orders.length > 200) throw error(409, "Contact customer care to link this large guest history");
    for (const order of orders) {
      if (order.customerSnapshot?.email?.toLowerCase() !== req.user.email.toLowerCase()) throw error(409, "A guest order email requires store review before linking");
      await patch(Order, order, { user: req.user._id }, unit);
      for (const name of ["Invoice", "Payment", "Refund", "OrderRequest", "ItemReturnCase", "CreditNote", "OrderNotification", "CouponRedemption", "ExchangePayment", "ReturnPickup", "WholeReturnCredit"]) {
        const Model = require("../models/" + name);
        for (const record of await qs(Model.find({ order: order._id, user: guest.user._id }), unit.session)) await patch(Model, record, { user: req.user._id }, unit);
      }
    }
    for (const session of await qs(Session.find({ user: guest.user._id }), unit.session)) await patch(Session, session, { claimedBy: req.user._id, expiresAt: new Date(0) }, unit);
    for (const recovery of await qs(Recovery.find({ user: guest.user._id }), unit.session)) await patch(Recovery, recovery, { expiresAt: new Date(0) }, unit);
    return { linked: orders.length };
    }));
  }));
  res.clearCookie(cookieName, cookieOptions()); return result;
}
async function requestRecovery(body) {
  const email = String(body.email || "").trim().toLowerCase(), id = body.orderId;
  if (!isValidEmail(email) || !/^[a-f0-9]{24}$/i.test(id || "")) return { message: "If those guest order details match, an access link will be emailed." };
  const order = await Order.findById(id), user = order ? await User.findById(order.user) : null;
  if (user?.isGuest && user.guestEmail === email && order.customerSnapshot?.email === email) {
    await withOperationLock("guest-recovery:" + user._id, async () => {
      if (await Recovery.exists({ user: user._id, requestedAt: { $gt: new Date(Date.now() - 60000) } })) return;
      const token = crypto.randomBytes(32).toString("hex");
      const url = new URL(require("./accountRecoveryService").accountActionUrl("guest", token));
      const row = await Recovery.create({ user: user._id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600000), requestedAt: new Date() });
      try { await require("./mailService").sendAccountMail({ to: email, subject: "Access your Norda guest orders", text: "Use this one-use link within one hour to access your guest orders: " + url.href, kind: "guest_access", actionUrl: url.href }); }
      catch (failure) { await Recovery.deleteOne({ _id: row._id }); require("./accountRecoveryService").safeMailError(failure); }
    });
  }
  return { message: "If those guest order details match, an access link will be emailed." };
}
async function recover(body, res) {
  if (!/^[a-f0-9]{64}$/.test(body.token || "")) throw error(400, "Invalid guest access link");
  return withOperationLock("guest-link:" + hash(body.token), async () => {
    const row = await Recovery.findOne({ tokenHash: hash(body.token), expiresAt: { $gt: new Date() } });
    const user = row ? await User.findById(row.user) : null;
    if (!user?.isGuest || !await Order.exists({ user: user._id })) throw error(400, "Guest access link is invalid, expired or already used");
    return withOperationLock("guest:" + user._id, async () => {
      const current = await Recovery.findOne({ _id: row._id, expiresAt: { $gt: new Date() } });
      if (!current || !await Order.exists({ user: user._id })) throw error(400, "Guest access link is invalid, expired or already used");
      const token = crypto.randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 30 * 86400000);
      const result = await withDatabaseUnit(async unit => {
        const session = await insert(Session, { user: user._id, tokenHash: hash(token), expiresAt }, unit.session);
        unit.compensate(() => Session.deleteOne({ _id: session._id }));
        await patch(Recovery, current, { expiresAt: new Date(0) }, unit, { expiresAt: { $gt: new Date() } });
        return view(session, user);
      });
      res.cookie(cookieName, token, { ...cookieOptions(), expires: expiresAt });
      return result;
    });
  });
}
module.exports = { active, view, ensure, issue, contact, guestOnly, shopper, mergeCart, claimOrders, requestRecovery, recover };

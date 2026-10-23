const Policy = require("../models/FulfillmentPolicy");
const Warehouse = require("../models/Warehouse");
const Stock = require("../models/WarehouseStock");
const Parcel = require("../models/FulfillmentParcel");
const Product = require("../models/Product");
const Order = require("../models/Order");
const error = require("../utils/httpError");
const { plain, hash } = require("../utils/expansion");
const { querySession: qs, insertDocument: insert, writeOptions, withDatabaseUnit } = require("./databaseUnit");
const { objectId, requestKey, noteText, patch, ownedOrder } = require("./orderOperationStore");
const { withOperationLock } = require("./operationLock");

async function policy(session) {
  const row = await qs(Policy.findById("store"), session);
  return row ? plain(row) : { _id: "store", enabled: false, allowSplit: true, revision: 0, locations: [{ warehouse: "online", priority: 0 }] };
}
async function savePolicy(user, body) {
  if (typeof body.enabled !== "boolean" || typeof body.allowSplit !== "boolean" || !Array.isArray(body.locations) || !body.locations.length || body.locations.length > 30) throw error(400, "Choose fulfillment availability, splitting and 1–30 locations");
  const seen = new Set(), locations = [];
  for (const row of body.locations) {
    const id = String(row.warehouse || "");
    if (seen.has(id) || !Number.isInteger(row.priority) || row.priority < 0 || row.priority > 1000) throw error(400, "Use unique locations and priorities from 0 to 1000");
    seen.add(id);
    if (id !== "online") { objectId(id); if (!(await Warehouse.findById(id))?.active) throw error(409, "Choose an active warehouse"); }
    locations.push({ warehouse: id, priority: row.priority });
  }
  return withOperationLock("warehouse-movements", () => withDatabaseUnit(async unit => {
    const current = await qs(Policy.findById("store"), unit.session);
    if (body.revision !== (current?.revision || 0)) throw error(409, "Fulfillment settings changed; reload before saving");
    const fields = { enabled: body.enabled, allowSplit: body.allowSplit, locations, revision: (current?.revision || 0) + 1, updatedBy: user._id };
    if (current) return patch(Policy, current, fields, unit);
    const saved = await insert(Policy, { _id: "store", ...fields }, unit.session); unit.compensate(() => Policy.deleteOne({ _id: "store" })); return saved;
  }));
}
async function locations(config, session) {
  const result = [];
  for (const entry of [...config.locations].sort((a, b) => a.priority - b.priority || a.warehouse.localeCompare(b.warehouse))) {
    if (entry.warehouse === "online") result.push({ id: "online", name: "Online fulfillment" });
    else { const w = await qs(Warehouse.findById(entry.warehouse), session); if (w?.active) result.push({ id: String(w._id), name: w.name }); }
  }
  return result;
}
async function enrich(products, session = null) {
  const config = await policy(session);
  if (!config.enabled || !products.length) return products;
  const sites = (await locations(config, session)).map(w => w.id), satellite = sites.filter(id => id !== "online");
  const stocks = satellite.length ? await qs(Stock.find({ warehouse: { $in: satellite }, product: { $in: products.map(p => p._id) } }), session) : [];
  return products.map(p => {
    const item = plain(p), rows = stocks.filter(s => String(s.product) === String(p._id));
    const available = (key, online) => {
      const quantities = rows.filter(s => s.variantKey === key).map(s => s.quantity);
      if (sites.includes("online")) quantities.push(online);
      return config.allowSplit ? quantities.reduce((n, q) => n + q, 0) : Math.max(0, ...quantities);
    };
    item.onlineStock = item.stock;
    if (item.variants?.length) { item.variants = item.variants.map(v => ({ ...plain(v), onlineStock: v.stock, stock: available(String(v._id), v.stock) })); item.stock = item.variants.filter(v => v.isActive !== false).reduce((n, v) => n + v.stock, 0); }
    else item.stock = available("base", item.stock);
    return item;
  });
}
async function reserve(item, unit) {
  const config = await policy(unit.session);
  if (!config.enabled) return require("./inventoryService").reserveItem(item, unit);
  const product = await qs(Product.findById(item.product), unit.session);
  const selected = require("./inventoryService").selection(product, item.variantId), sites = await locations(config, unit.session), options = [];
  for (const site of sites) {
    const row = site.id === "online" ? null : await qs(Stock.findOne({ warehouse: site.id, product: item.product, variantKey: String(item.variantId || "base") }), unit.session);
    options.push({ ...site, row, quantity: site.id === "online" ? selected.stock : row?.quantity || 0 });
  }
  let wanted = item.quantity;
  if (!config.allowSplit) { const site = options.find(w => w.quantity >= wanted); if (!site) throw error(409, "No single fulfillment location has the requested quantity"); options.splice(0, options.length, site); }
  const allocations = [];
  for (const site of options) {
    const amount = Math.min(wanted, site.quantity); if (!amount) continue;
    if (site.id === "online") await require("./inventoryService").reserveItem({ ...item, quantity: amount }, unit);
    else {
      const held = await Warehouse.findOneAndUpdate({ _id: site.id, active: true }, { $inc: { reservationUnits: amount } }, writeOptions(unit.session, { new: true }));
      if (!held) throw error(409, "Warehouse availability changed; refresh checkout");
      unit.compensate(() => Warehouse.updateOne({ _id: site.id }, { $inc: { reservationUnits: -amount } }));
      const changed = await Stock.findOneAndUpdate({ _id: site.row._id, quantity: { $gte: amount } }, { $inc: { quantity: -amount } }, writeOptions(unit.session, { new: true }));
      if (!changed) throw error(409, "Warehouse stock changed; review checkout");
      unit.compensate(() => Stock.updateOne({ _id: site.row._id }, { $inc: { quantity: amount } }));
    }
    allocations.push({ warehouse: site.id, warehouseName: site.name, quantity: amount }); wanted -= amount; if (!wanted) break;
  }
  if (wanted) throw error(409, "Not enough combined stock for " + item.name);
  item.fulfillmentAllocations = allocations;
}
async function restore(item, unit, strict) {
  for (const allocation of item.fulfillmentAllocations) {
    if (allocation.warehouse === "online") await require("./inventoryService").restoreItem({ ...plain(item), fulfillmentAllocations: undefined, quantity: allocation.quantity }, unit, strict);
    else {
      const row = await qs(Stock.findOne({ warehouse: allocation.warehouse, product: item.product, variantKey: String(item.variantId || "base") }), unit.session);
      if (!row) throw error(409, "The original warehouse balance is missing; inventory review is required");
      const changed = await Stock.updateOne({ _id: row._id }, { $inc: { quantity: allocation.quantity } }, writeOptions(unit.session));
      if (!changed.matchedCount) throw error(409, "Warehouse stock could not be restored");
      unit.compensate(() => Stock.updateOne({ _id: row._id }, { $inc: { quantity: -allocation.quantity } }));
    }
  }
  return true;
}
// Existing payment recovery keeps the original warehouse plan and parcel IDs.
// A new policy must not move an expired order's frozen fulfillment records.
async function reservePlanned(item, unit) {
  const allocations = item.fulfillmentAllocations;
  if (allocations.reduce((n, a) => n + a.quantity, 0) !== item.quantity || allocations.some(a => !Number.isSafeInteger(a.quantity) || a.quantity < 1)) throw error(409, "The saved warehouse allocation needs inventory review");
  for (const allocation of allocations) {
    if (allocation.warehouse === "online") await require("./inventoryService").reserveItem({ ...plain(item), fulfillmentAllocations: undefined, quantity: allocation.quantity }, unit);
    else {
      const product = await qs(Product.findById(item.product), unit.session);
      require("./inventoryService").selection(product, item.variantId);
      const held = await Warehouse.findOneAndUpdate({ _id: allocation.warehouse, active: true }, { $inc: { reservationUnits: allocation.quantity } }, writeOptions(unit.session, { new: true }));
      if (!held) throw error(409, "The original fulfillment warehouse is unavailable; contact the store");
      unit.compensate(() => Warehouse.updateOne({ _id: allocation.warehouse }, { $inc: { reservationUnits: -allocation.quantity } }));
      const stock = await Stock.findOneAndUpdate({ warehouse: allocation.warehouse, product: item.product, variantKey: String(item.variantId || "base"), quantity: { $gte: allocation.quantity } }, { $inc: { quantity: -allocation.quantity } }, writeOptions(unit.session, { new: true }));
      if (!stock) throw error(409, "The original warehouse no longer has enough stock for payment recovery");
      unit.compensate(() => Stock.updateOne({ _id: stock._id }, { $inc: { quantity: allocation.quantity } }));
    }
  }
}
async function reopenParcels(order, unit) {
  if (!order.fulfillmentManaged) return;
  const parcels = await qs(Parcel.find({ order: order._id }), unit.session);
  if (!parcels.length || parcels.some(p => p.status !== "cancelled")) throw error(409, "The restored warehouse parcels need review before payment recovery");
  for (const parcel of parcels) await patch(Parcel, parcel, { status: "pending", history: [...parcel.history.map(plain), { key: "recovery-" + require("node:crypto").randomUUID(), status: "pending", note: "Original warehouse stock re-reserved for payment recovery", at: new Date() }] }, unit);
}
async function createParcels(order, unit) {
  if (!order.items.some(i => i.fulfillmentAllocations?.length)) return;
  const groups = new Map(), discounts = require("./salesReportService").allocateDiscount(order.items, Math.round((order.discountAmount || 0) * 100));
  order.items.forEach((line, lineIndex) => {
    let ordinal = 0; const net = Math.round(line.price * 100) * line.quantity - discounts[lineIndex], floor = Math.floor(net / line.quantity), extra = net % line.quantity;
    for (const a of line.fulfillmentAllocations || []) {
      const row = groups.get(a.warehouse) || { order: order._id, warehouse: a.warehouse, warehouseName: a.warehouseName, items: [], amount: 0, history: [], status: "pending" };
      row.items.push({ lineIndex, product: line.product, variantId: line.variantId, sku: line.sku, name: line.name, quantity: a.quantity });
      for (let n = 0; n < a.quantity; n++, ordinal++) row.amount += floor + (ordinal < extra ? 1 : 0);
      groups.set(a.warehouse, row);
    }
  });
  let first = true;
  for (const row of groups.values()) {
    if (first) row.amount += Math.round(order.shippingFee * 100); first = false; row.amount /= 100;
    const saved = await insert(Parcel, row, unit.session); unit.compensate(() => Parcel.deleteOne({ _id: saved._id }));
  }
}
async function assertCancelable(orderId, session) {
  if (await qs(Parcel.exists({ order: orderId, status: { $in: ["shipped", "delivered"] } }), session)) throw error(409, "A split shipment has left the warehouse; use the return workflow after delivery");
}
async function cancelParcels(orderId, unit) {
  for (const parcel of await qs(Parcel.find({ order: orderId, status: { $nin: ["cancelled", "delivered"] } }), unit.session)) { await releaseReservation(parcel, unit); await patch(Parcel, parcel, { status: "cancelled" }, unit); }
}
async function releaseReservation(parcel, unit) {
  if (parcel.warehouse === "online") return;
  const quantity = parcel.items.reduce((n, i) => n + i.quantity, 0);
  const changed = await Warehouse.updateOne({ _id: parcel.warehouse, reservationUnits: { $gte: quantity } }, { $inc: { reservationUnits: -quantity } }, writeOptions(unit.session));
  if (!changed.matchedCount) throw error(409, "The warehouse reservation ledger needs reconciliation");
  unit.compensate(() => Warehouse.updateOne({ _id: parcel.warehouse }, { $inc: { reservationUnits: quantity } }));
}
async function legacyStatus(order, status, unit, internal) {
  if (!order.fulfillmentManaged || internal || !["shipped", "delivered"].includes(status)) return;
  if (await qs(Parcel.countDocuments({ order: order._id }), unit.session) > 1) throw error(409, "Update the individual warehouse parcels in Fulfillment; the order follows all parcels");
}
async function syncSingle(order, unit) {
  if (!order.fulfillmentManaged) return;
  const rows = await qs(Parcel.find({ order: order._id }), unit.session);
  if (rows.length === 1 && rows[0].status !== order.status) { if (order.status === "delivered") await releaseReservation(rows[0], unit); await patch(Parcel, rows[0], { status: order.status, ...(order.shipment?.courierName ? { courierName: order.shipment.courierName, trackingNumber: order.shipment.trackingNumber, trackingUrl: order.shipment.trackingUrl } : {}) }, unit); }
}
async function updateParcel(id, user, body) {
  objectId(id); const key = requestKey(body.requestKey), note = noteText(body.note), reference = await Parcel.findById(id);
  if (!reference) throw error(404, "Parcel not found");
  if (!["processing", "shipped", "delivered"].includes(body.status)) throw error(400, "Choose processing, shipped or delivered");
  if (body.status === "delivered" && body.confirmed !== true) throw error(400, "Confirm physical delivery and any cash collection for this parcel");
  const fingerprint = hash([body.status, body.courierName || "", body.trackingNumber || "", body.trackingUrl || "", note]);
  return withOperationLock("order:" + reference.order, () => withDatabaseUnit(async unit => {
    let order = await ownedOrder(reference.order, user, unit.session, "orders");
    if (require("./orderOperationStore").hasBlockingOperation(order) || order.status === "cancelled" || (order.paymentMethod !== "cod" && order.paymentStatus !== "paid")) throw error(409, "Resolve the order/payment before dispatching parcels");
    const parcel = await qs(Parcel.findById(id), unit.session), replay = parcel.history.find(h => h.key === key);
    if (replay) { if (replay.hash !== fingerprint) throw error(409, "This parcel key belongs to different details"); return parcel; }
    if ({ pending: "processing", processing: "shipped", shipped: "delivered" }[parcel.status] !== body.status) throw error(409, "Parcel status must move forward one step");
    const fields = { status: body.status, history: [...parcel.history.map(plain), { key, hash: fingerprint, status: body.status, note, actor: user._id, at: new Date() }] };
    if (body.status === "shipped") {
      const { text } = require("../utils/expansion"); fields.courierName = text(body.courierName, 80); fields.trackingNumber = text(body.trackingNumber, 100);
      fields.trackingUrl = require("./shipmentService").normalizeShipment({ requestKey: key, trackingUrl: body.trackingUrl || "" }).trackingUrl; fields.shippedAt = new Date();
    }
    if (body.status === "delivered") { fields.deliveredAt = new Date(); await releaseReservation(parcel, unit); }
    const changed = await patch(Parcel, parcel, fields, unit), all = await qs(Parcel.find({ order: order._id }), unit.session);
    const next = all.every(p => p.status === "delivered") ? "delivered" : all.every(p => ["shipped", "delivered"].includes(p.status)) ? "shipped" : "processing";
    const rank = { pending: 0, processing: 1, shipped: 2, delivered: 3 };
    for (const state of ["processing", "shipped", "delivered"]) if (rank[state] > rank[order.status] && rank[state] <= rank[next]) order = await require("./orderService").updateOrderInUnit(order._id, { status: state }, user, unit, { parcel: true });
    await require("./orderOperationStore").audit(order._id, user, "parcel_" + body.status, note, unit);
    return changed;
  }));
}
module.exports = { policy, savePolicy, enrich, reserve, reservePlanned, reopenParcels, restore, createParcels, assertCancelable, cancelParcels, legacyStatus, syncSingle, updateParcel };

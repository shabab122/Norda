// Fault-injecting model adapter for regression tests. It is never used by app.js.
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const pathValue = (value, path) => {
  const parts = path.split(".");
  let current = value;
  for (const part of parts) {
    if (Array.isArray(current)) return current.map((item) => pathValue(item, parts.slice(parts.indexOf(part)).join(".")));
    current = current?.[part];
  }
  return current;
};
const equal = (left, right) => String(left?._id || left) === String(right?._id || right);
const matches = (row, filter = {}) => Object.entries(filter).every(([key, expected]) => {
  if (key === "$or") return expected.some((part) => matches(row, part));
  if (key === "$and") return expected.every((part) => matches(row, part));
  const value = pathValue(row, key);
  if (expected === null) return value === null || value === undefined;
  if (expected && typeof expected === "object" && !(expected instanceof Date) && !expected._id && typeof expected.toHexString !== "function") {
    return Object.entries(expected).every(([operator, argument]) => {
      const left = argument instanceof Date ? new Date(value).getTime() : value;
      const right = argument instanceof Date ? argument.getTime() : argument;
      if (operator === "$ne") return !(Array.isArray(value) ? value.some((v) => equal(v, argument)) : equal(value, argument));
      if (operator === "$in") return argument.some((item) => Array.isArray(value) ? value.some((v) => equal(v, item)) : equal(value, item));
      if (operator === "$nin") return !argument.some((item) => equal(value, item));
      if (operator === "$gte") return left >= right;
      if (operator === "$lte") return left <= right;
      if (operator === "$gt") return left > right;
      if (operator === "$lt") return left < right;
      if (operator === "$size") return Array.isArray(value) && value.length === argument;
      if (operator === "$elemMatch") return Array.isArray(value) && value.some((v) => matches(v, argument));
      if (operator === "$type") return typeof value === argument;
      if (operator === "$exists") return (value !== undefined) === argument;
      if (operator === "$regex") return new RegExp(argument, expected.$options || "").test(value || "");
      if (operator === "$options") return true;
      throw new Error("Unsupported test query operator: " + operator);
    });
  }
  return Array.isArray(value) ? value.some((item) => equal(item, expected)) : equal(value, expected);
});
const apply = (row, update, inserted = false, filter = {}) => {
  if (inserted && update.$setOnInsert) Object.assign(row, clone(update.$setOnInsert));
  if (update.$set) Object.assign(row, clone(update.$set));
  for (const [key, value] of Object.entries(update.$inc || {})) {
    if (key === "variants.$.stock") { const variant = row.variants.find((v) => matches(v, filter.variants.$elemMatch)); variant.stock += value; }
    else row[key] = (row[key] || 0) + value;
  }
  for (const key of Object.keys(update.$unset || {})) delete row[key];
  if (!Object.keys(update).some((key) => key.startsWith("$"))) Object.assign(row, clone(update));
};
const installMemoryStore = () => {
  const names = ["User", "Cart", "Product", "Order", "Invoice", "Payment", "OperationLock", "Category", "Brand", "Review", "Upload", "OrderRequest", "Refund", "OrderEvent", "ShipmentEvent", "OrderNotification"];
  const models = Object.fromEntries(names.map((name) => [name, require("../models/" + name)]));
  const records = Object.fromEntries(names.map((name) => [name, new Map()]));
  const originals = []; const failures = new Map(); let sequence = 100;
  const checkFailure = (name, method) => {
    const failure = failures.get(name + "." + method);
    if (failure && --failure.remaining === 0) { failures.delete(name + "." + method); throw new Error("Injected " + name + "." + method + " failure"); }
  };
  const patch = (name, method, fn) => { originals.push([models[name], method, models[name][method]]); models[name][method] = fn; };
  const document = (name, value) => {
    if (!value) return null;
    const doc = clone(value);
    Object.defineProperty(doc, "toObject", { value: () => clone(doc), enumerable: false });
    Object.defineProperty(doc, "save", { value: async () => { checkFailure(name, "save"); if (name === "User" && doc.password && doc.password !== records[name].get(String(doc._id))?.password) doc.password = require("bcryptjs").hashSync(doc.password, 4); if (name === "Cart") doc.items.forEach((item) => { item._id ||= (++sequence).toString(16).padStart(24, "0"); }); records[name].set(String(doc._id), clone(doc)); return doc; }, enumerable: false });
    Object.defineProperty(doc, "deleteOne", { value: async () => { records[name].delete(String(doc._id)); return {}; }, enumerable: false });
    Object.defineProperty(doc, "populate", { value: async (field) => { populate(doc, field); return doc; }, enumerable: false });
    if (name === "User") Object.defineProperty(doc, "matchPassword", { value: async (password) => require("bcryptjs").compare(password, doc.password), enumerable: false });
    if (Array.isArray(doc.items)) Object.defineProperty(doc.items, "id", { value: (id) => doc.items.find((item) => equal(item._id, id)), enumerable: false });
    return doc;
  };
  const populate = (doc, field) => {
    const fields = Array.isArray(field) ? field : [field];
    for (const specification of fields) {
      const key = typeof specification === "string" ? specification : specification.path;
      const selection = typeof specification === "string" ? null : specification.select;
      if (key === "items.product") doc.items.forEach((item) => { item.product = clone(records.Product.get(String(item.product?._id || item.product)) || null); });
      else {
        const target = { user: "User", order: "Order", category: "Category", brandRef: "Brand" }[key];
        if (target && doc[key]) {
          const value = clone(records[target].get(String(doc[key]?._id || doc[key])) || null);
          doc[key] = value && selection ? Object.fromEntries(["_id", ...selection.split(" ")].filter((field) => value[field] !== undefined).map((field) => [field, value[field]])) : value;
        }
      }
    }
  };
  class Query {
    constructor(name, read) { this.name = name; this.read = read; this.populations = []; this.sorting = null; this.offset = 0; this.maximum = Infinity; }
    populate(path, select) { this.populations.push({ path, select }); return this; }
    session() { return this; } select() { return this; } lean() { return this; }
    sort(value) { this.sorting = value; return this; } skip(value) { this.offset = value; return this; } limit(value) { this.maximum = value; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => {
      let result = this.read();
      if (Array.isArray(result)) {
        if (this.sorting) result.sort((a, b) => { for (const [key, direction] of Object.entries(this.sorting)) { if (a[key] < b[key]) return -direction; if (a[key] > b[key]) return direction; } return 0; });
        result = result.slice(this.offset, this.offset + this.maximum).map((item) => document(this.name, item));
      } else result = document(this.name, result);
      for (const doc of Array.isArray(result) ? result : result ? [result] : []) for (const path of this.populations) populate(doc, path);
      return result;
    }).then(resolve, reject); }
  }
  for (const name of names) {
    patch(name, "findById", (id) => new Query(name, () => records[name].get(String(id))));
    patch(name, "findOne", (filter) => new Query(name, () => [...records[name].values()].find((row) => matches(row, filter))));
    patch(name, "find", (filter) => new Query(name, () => [...records[name].values()].filter((row) => matches(row, filter))));
    patch(name, "exists", async (filter) => [...records[name].values()].some((row) => matches(row, filter)));
    patch(name, "countDocuments", async (filter) => [...records[name].values()].filter((row) => matches(row, filter)).length);
    patch(name, "create", async (value) => {
      checkFailure(name, "create");
      const row = clone(value); row._id ||= (++sequence).toString(16).padStart(24, "0"); row.createdAt ||= new Date().toISOString(); row.__v ||= 0;
      if (name === "User") { row.role ||= "user"; row.tokenVersion ||= 0; row.password = require("bcryptjs").hashSync(row.password || "test-password", 4); }
      if (name === "Order") Object.assign(row, { status: "pending", isPaid: false, stockRestored: false, ...row });
      if (name === "Payment") Object.assign(row, { status: "initiated", ...row });
      if (name === "Cart") row.items.forEach((item) => { item._id ||= (++sequence).toString(16).padStart(24, "0"); });
      const duplicate = records[name].has(String(row._id)) || (name === "Order" && row.checkoutKey && [...records[name].values()].some((item) => equal(item.user, row.user) && item.checkoutKey === row.checkoutKey));
      if (duplicate) { const error = new Error("Duplicate record"); error.code = 11000; throw error; }
      records[name].set(String(row._id), row); return document(name, row);
    });
    patch(name, "findOneAndUpdate", async (filter, update, options = {}) => {
      checkFailure(name, "findOneAndUpdate");
      let row = [...records[name].values()].find((item) => matches(item, filter));
      if (!row && options.upsert) { row = clone(filter); apply(row, update, true); return models[name].create(row); }
      if (!row) return null; apply(row, update, false, filter); return document(name, row);
    });
    patch(name, "findByIdAndUpdate", (id, update, options) => models[name].findOneAndUpdate({ _id: id }, update, options));
    patch(name, "updateOne", async (filter, update) => {
      checkFailure(name, "updateOne"); const row = [...records[name].values()].find((item) => matches(item, filter));
      if (!row) return { matchedCount: 0 }; apply(row, update, false, filter); return { matchedCount: 1, modifiedCount: 1 };
    });
    patch(name, "deleteOne", async (filter) => { checkFailure(name, "deleteOne"); const row = [...records[name].values()].find((item) => matches(item, filter)); if (row) records[name].delete(String(row._id)); return { deletedCount: row ? 1 : 0 }; });
  }
  patch("Product", "populate", async (rows, specs) => { for (const row of rows) populate(row, specs); return rows; });
  patch("Product", "aggregate", async (pipeline) => {
    let rows = [...records.Product.values()].filter((row) => matches(row, pipeline[0].$match)).map((row) => ({ ...clone(row), effectivePrice: row.discountPrice > 0 && row.discountPrice < row.price ? row.discountPrice : row.price }));
    const priceFilter = pipeline.find((stage) => stage.$match?.effectivePrice);
    if (priceFilter) rows = rows.filter((row) => matches(row, priceFilter.$match));
    const facet = pipeline.find((stage) => stage.$facet).$facet;
    const sort = facet.products[0].$sort;
    rows.sort((a, b) => { for (const [key, direction] of Object.entries(sort)) { if (a[key] < b[key]) return -direction; if (a[key] > b[key]) return direction; } return 0; });
    return [{ products: rows.slice(facet.products[1].$skip, facet.products[1].$skip + facet.products[2].$limit), total: [{ count: rows.length }] }];
  });
  patch("Order", "aggregate", async (pipeline) => {
    let rows = [...records.Order.values()];
    if (pipeline[0].$match) rows = rows.filter((row) => matches(row, pipeline[0].$match));
    const group = pipeline.find((stage) => stage.$group).$group;
    if (group._id === "$status") {
      const counts = new Map(); for (const row of rows) counts.set(row.status, (counts.get(row.status) || 0) + 1);
      return [...counts].map(([status, count]) => ({ _id: status, count }));
    }
    return [{ _id: null, total: rows.reduce((sum, row) => sum + (group.total?.$sum?.$max ? Math.max(0, row.totalAmount - (row.refundedAmount || 0)) : row.totalAmount), 0) }];
  });
  patch("Review", "aggregate", async (pipeline) => {
    const rows = [...records.Review.values()].filter((row) => matches(row, pipeline[0].$match));
    return rows.length ? [{ ratingCount: rows.length, ratingAverage: rows.reduce((sum, row) => sum + row.rating, 0) / rows.length }] : [];
  });
  return {
    models, records,
    add(name, row) { records[name].set(String(row._id), clone(row)); return document(name, row); },
    get(name, id) { return clone(records[name].get(String(id))); },
    reset() { for (const store of Object.values(records)) store.clear(); failures.clear(); },
    fail(name, method, occurrence = 1) { failures.set(name + "." + method, { remaining: occurrence }); },
    restore() { for (const [Model, method, fn] of originals.reverse()) Model[method] = fn; },
  };
};
module.exports = { installMemoryStore };

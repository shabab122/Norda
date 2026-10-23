const crypto = require("node:crypto");
const User = require("../models/User");
const { cleanText } = require("../utils/validation");
const httpError = require("../utils/httpError");
const { withOperationLock } = require("./operationLock");

const ADDRESS_FIELDS = { line1: 120, line2: 120, city: 60, district: 60, postCode: 20, country: 60, phone: 20 };
const plainAddress = (value = {}) => Object.fromEntries(Object.entries(ADDRESS_FIELDS).map(([key, max]) => [key, cleanText(value[key], max) || (key === "country" ? "Bangladesh" : "")]));

function addressBook(user) {
  let addresses = (user.addresses || []).map((entry) => ({ _id: String(entry._id), label: entry.label, ...plainAddress(entry) }));
  // A virtual entry preserves old installations without a migration or a write
  // on GET. The first mutation gives this entry a permanent identifier.
  if (!addresses.length && user.address?.line1) addresses = [{ _id: "legacy", label: "Saved address", ...plainAddress(user.address) }];
  const defaultAddressId = addresses.find((entry) => entry._id === user.defaultAddressId)?._id || addresses[0]?._id || null;
  return { addresses: addresses.map((entry) => ({ ...entry, isDefault: entry._id === defaultAddressId })), defaultAddressId };
}

function profilePayload(user) {
  const book = addressBook(user);
  const preferred = book.addresses.find((entry) => entry.isDefault);
  return {
    _id: user._id, name: user.name, email: user.email, role: user.role,
    mfaEnabled: Boolean(user.mfaEnabled), staffMfaRequired: Boolean(user.staffMfaRequired),
    permissions: user.role === "staff" ? [...(user.permissions || [])] : [],
    notificationPreferences: { orderUpdates: true, returnUpdates: true, refundUpdates: true, ...(user.notificationPreferences?.toObject?.() || user.notificationPreferences || {}) },
    address: preferred ? plainAddress(preferred) : user.address || null,
    ...book, emailVerified: Boolean(user.emailVerifiedAt), emailVerifiedAt: user.emailVerifiedAt || null,
  };
}

function validateAddress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw httpError(400, "Please provide a delivery address");
  for (const [key, max] of Object.entries({ label: 30, ...ADDRESS_FIELDS })) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || value[key].trim().length > max)) throw httpError(400, "Invalid address field: " + key);
  }
  const label = cleanText(value.label, 30);
  const address = plainAddress(value);
  if (!label) throw httpError(400, "Give this address a label, such as Home or Office");
  if (["line1", "city", "district", "postCode", "phone"].some((key) => !address[key])) throw httpError(400, "Street, city, district, postal code and phone are required");
  if (!/^[+()\d\s-]{7,20}$/.test(address.phone) || address.phone.replace(/\D/g, "").length < 7) throw httpError(400, "Please provide a valid phone number");
  if (value.isDefault !== undefined && typeof value.isDefault !== "boolean") throw httpError(400, "Default address must be true or false");
  return { label, ...address };
}

const validAddressId = (value) => value === "legacy" || (typeof value === "string" && /^[a-f\d]{24}$/.test(value));

async function mutateAddressBook(userId, action, id, value) {
  if (id !== undefined && !validAddressId(id)) throw httpError(400, "Invalid address identifier");
  const clean = ["add", "edit"].includes(action) ? validateAddress(value) : null;
  return withOperationLock("address-book:" + userId, async () => {
    const user = await User.findById(userId);
    if (!user) throw httpError(404, "Account not found");
    const book = addressBook(user);
    let { addresses, defaultAddressId } = book;
    if (action !== "add" && !addresses.some((entry) => entry._id === id)) throw httpError(404, "Address not found");
    if (action === "add" && addresses.length >= 10) throw httpError(400, "You can save up to 10 delivery addresses");
    const legacy = addresses.find((entry) => entry._id === "legacy");
    if (legacy) {
      legacy._id = crypto.randomBytes(12).toString("hex");
      if (defaultAddressId === "legacy") defaultAddressId = legacy._id;
      if (id === "legacy") id = legacy._id;
    }
    if (action === "add") {
      const entry = { _id: crypto.randomBytes(12).toString("hex"), ...clean };
      addresses.push(entry);
      if (addresses.length === 1 || value.isDefault === true) defaultAddressId = entry._id;
    } else if (action === "edit") {
      addresses = addresses.map((entry) => entry._id === id ? { _id: id, ...clean } : entry);
      if (value.isDefault === true) defaultAddressId = id;
    } else if (action === "default") defaultAddressId = id;
    else if (action === "delete") {
      addresses = addresses.filter((entry) => entry._id !== id);
      if (defaultAddressId === id) defaultAddressId = addresses[0]?._id || null;
    } else throw httpError(400, "Unsupported address update");
    addresses = addresses.map(({ isDefault, ...entry }) => entry);
    const preferred = addresses.find((entry) => entry._id === defaultAddressId);
    const update = { $set: { addresses, defaultAddressId, ...(preferred ? { address: plainAddress(preferred) } : {}) } };
    if (!preferred) update.$unset = { address: 1 };
    const updated = await User.findOneAndUpdate({ _id: userId }, update, { new: true, runValidators: true });
    if (!updated) throw httpError(404, "Account not found");
    return profilePayload(updated);
  });
}

module.exports = { addressBook, mutateAddressBook, plainAddress, profilePayload, validateAddress };

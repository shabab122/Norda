const SCOPES = Object.freeze(["reports", "catalog", "inventory", "orders", "payments", "customers", "notifications", "marketing", "settings"]);
const hasPermission = (user, scope) => user?.role === "admin" || (user?.role === "staff" && (!user.staffMfaRequired || user.mfaEnabled) && SCOPES.includes(scope) && (user.permissions || []).includes(scope));
module.exports = { SCOPES, hasPermission };

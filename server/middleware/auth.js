const jwt = require("jsonwebtoken");
const User = require("../models/User");
const sessions = require("../services/sessionService");

// Verifies the JWT and attaches the logged-in user to req.user
const protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.cookies && req.cookies.norda_token) {
    token = req.cookies.norda_token;
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }

  let decoded;
  try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ message: "Not authorized, invalid or expired token" }); }
  try {
    const user = await User.findById(decoded.id);
    if (!user || (decoded.version || 0) !== (user.tokenVersion || 0)) return res.status(401).json({ message: "Your session has expired. Please sign in again." });
    const session = await sessions.authenticateSession(decoded, token, user, req);
    if (!session) return res.status(401).json({ message: "This device session has expired or was signed out. Please sign in again." });
    req.sessionId = session._id;
    req.user = user;
    req.auth = { id: user._id.toString(), email: user.email, role: user.role };
    next();
  } catch (error) { next(error); }

};

// Restricts a route to admins only. Must be used after `protect`.
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  return res.status(403).json({ message: "Access denied. Admins only." });
};

const authorize = (scope) => (req, res, next) => require("../utils/permissions").hasPermission(req.user, scope) ? next() : res.status(403).json({ message: "You do not have permission for " + scope });
module.exports = { protect, adminOnly, authorize };

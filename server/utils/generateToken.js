const jwt = require("jsonwebtoken");

const generateToken = (id, tokenVersion = 0, sessionId) => {
  return jwt.sign({ id, version: tokenVersion, ...(sessionId ? { sid: String(sessionId) } : {}) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

module.exports = generateToken;

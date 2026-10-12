const jwt = require("jsonwebtoken");

const generateToken = (id, tokenVersion = 0) => {
  return jwt.sign({ id, version: tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

module.exports = generateToken;

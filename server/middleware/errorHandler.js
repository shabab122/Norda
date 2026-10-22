const notFound = (req, res, next) => {
  res.status(404).json({ message: `Route not found - ${req.originalUrl}` });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  let message = err.message || "Server Error";

  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource identifier";
  }
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors).map((item) => item.message).join(", ");
  }
  if (err.code === 11000) {
    statusCode = 409;
    message = "A record with that value already exists";
  }
  if (err.name === "MulterError") {
    statusCode = 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "Image must be 5 MB or smaller" : err.message;
  }

  if (statusCode >= 500) require("../services/operationsService").captureError(err, req);
  res.status(statusCode).json({
    message: statusCode >= 500 && process.env.NODE_ENV === "production" ? "Server Error" : message,
  });
};

module.exports = { notFound, errorHandler };

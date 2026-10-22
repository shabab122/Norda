require("dotenv").config();

const mongoose = require("mongoose");
const app = require("./app");
const { startNotificationWorker } = require("./services/notificationService");
const { startRefundWorker } = require("./services/refundService");
const connectDB = require("./config/db");
const { reservationMinutes, sweepSeconds } = require("./config/reservations");
const { startReservationWorker } = require("./services/reservationService");

const validateEnvironment = () => {
  reservationMinutes();
  sweepSeconds();
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith("replace_")) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be configured");
  }
  if (process.env.NODE_ENV === "production" && !process.env.CLIENT_URL) {
    throw new Error("CLIENT_URL must be configured in production");
  }
};

const startServer = async () => {
  validateEnvironment();
  await connectDB();
  await Promise.all([require("./models/Product").init(), require("./models/ShipmentEvent").init(), require("./models/OrderNotification").init(), ...["Coupon", "CouponRedemption", "WishlistItem", "StoreSettings", "InventoryImport"].map((name) => require("./models/" + name).init())]);
  const port = Number(process.env.PORT) || 5000;
  if ([3000, 3002].includes(port)) throw new Error("Ports 3000 and 3002 are reserved for GitStack/Gitea. Use PORT=5000 for Norda.");
  const server = app.listen(port, () => {
    console.log("Norda API running on http://localhost:" + port);
  });

  const stopReservations = startReservationWorker();
  const stopRefunds = startRefundWorker();
  const stopNotifications = startNotificationWorker();
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(signal + " received. Closing server...");
    server.close(async () => {
      await Promise.all([stopReservations(), stopRefunds(), stopNotifications()]);
      await mongoose.connection.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  return server;
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  });
}

module.exports = { startServer, validateEnvironment };

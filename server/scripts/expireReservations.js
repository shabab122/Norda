require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { expireReservations } = require("../services/reservationService");
(async () => {
  try { await connectDB(); const result = await expireReservations({ limit: 200 }); console.log(JSON.stringify(result)); if (result.failed) process.exitCode = 1; }
  catch (error) { console.error("Reservation expiry failed:", error.message); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
})();

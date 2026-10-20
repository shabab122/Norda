const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    image: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [orderItemSchema],
    shippingAddress: {
      line1: String,
      line2: String,
      city: String,
      district: String,
      postCode: String,
      country: { type: String, default: "Bangladesh" },
      phone: String,
    },
    subtotal: { type: Number, required: true, min: 0, default: 0 },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    paymentMethod: { type: String, enum: ["cod", "sslcommerz", "demo"], default: "cod" },
    paymentChannel: { type: String, enum: ["", "mobile_banking", "card_bank"], default: "" },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: "BDT", uppercase: true },
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    isPaid: { type: Boolean, default: false },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled", "review"],
      default: "pending",
    },
    transactionId: { type: String, default: "", index: true },
    checkoutKey: { type: String, maxlength: 80 },
    reservationExpiresAt: Date,
    reservationExpiredAt: Date,
    paidTransactionId: { type: String, default: "" },
    paymentReviewReason: { type: String, default: "", maxlength: 500 },
    paidAt: Date,
    stockRestored: { type: Boolean, default: false },
    cancelledAt: Date,
    cancelReason: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true }
);

orderSchema.index({ reservationExpiresAt: 1, status: 1, isPaid: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, paymentStatus: 1, createdAt: -1 });
orderSchema.index({ user: 1, checkoutKey: 1 }, { unique: true, partialFilterExpression: { checkoutKey: { $type: "string" } } });

module.exports = mongoose.model("Order", orderSchema);

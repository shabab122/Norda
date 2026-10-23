const mongoose = require("mongoose");
const couponSnapshotSchema = new mongoose.Schema({ _id: mongoose.Schema.Types.ObjectId, code: String, title: String, type: String, value: Number, minSubtotal: Number, maxDiscount: Number }, { _id: false });

const orderItemSchema = new mongoose.Schema(
  {
    fulfillmentAllocations: { type: [new mongoose.Schema({ warehouse: String, warehouseName: String, quantity: Number }, { _id: false })], default: undefined },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: mongoose.Schema.Types.ObjectId, sku: { type: String, default: "" },
    size: { type: String, default: "" }, color: { type: String, default: "" },
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
      thana: String, area: String,
      line1: String,
      line2: String,
      city: String,
      district: String,
      postCode: String,
      country: { type: String, default: "Bangladesh" },
      phone: String,
    },
    returnPolicy: { type: new mongoose.Schema({ returnWindowDays: Number, exchangeEnabled: Boolean }, { _id: false }), default: undefined },
    shipment: {
      courierName: { type: String, default: "", maxlength: 80 }, trackingNumber: { type: String, default: "", maxlength: 100 },
      trackingUrl: { type: String, default: "", maxlength: 500 }, state: { type: String, default: "", enum: ["", "shipped", "in_transit", "out_for_delivery", "delivery_attempted", "delivered"] },
      shippedAt: Date, deliveredAt: Date, lastUpdatedAt: Date,
    },
    fulfillmentManaged: { type: Boolean, default: false },
    customerSnapshot: { name: String, email: String, isGuest: Boolean },
    subtotal: { type: Number, required: true, min: 0, default: 0 },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    coupon: { type: couponSnapshotSchema, default: undefined },
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
    paymentReviewStatus: { type: String, enum: ["none", "open", "approved", "refunded"], default: "none" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, reviewedAt: Date,
    reviewResolutionNote: { type: String, default: "", maxlength: 1000 },
    settledPayment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    settledValidationId: { type: String, default: "", maxlength: 100 },
    settledBankTransactionId: { type: String, default: "", maxlength: 100 },
    cancellationStatus: { type: String, enum: ["none", "requested", "approved", "rejected", "completed"], default: "none" },
    returnStatus: { type: String, enum: ["none", "requested", "approved", "rejected", "received", "completed"], default: "none" },
    returnStockRestored: { type: Boolean, default: false },
    refundStatus: { type: String, enum: ["none", "pending", "partially_refunded", "refunded", "failed", "unknown"], default: "none" },
    refundedAmount: { type: Number, min: 0, default: 0 },
    refundPendingAmount: { type: Number, min: 0, default: 0 },
    extraRefundedAmount: { type: Number, min: 0, default: 0 },
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

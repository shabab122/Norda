const mongoose = require("mongoose");
const couponSnapshotSchema = new mongoose.Schema({ _id: mongoose.Schema.Types.ObjectId, code: String, title: String, type: String, value: Number, minSubtotal: Number, maxDiscount: Number }, { _id: false });

const invoiceItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: mongoose.Schema.Types.ObjectId, sku: { type: String, default: "" },
    size: { type: String, default: "" }, color: { type: String, default: "" },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: { type: [invoiceItemSchema], required: true },
    shippingAddress: {
      line1: String,
      line2: String,
      city: String,
      district: String,
      postCode: String,
      country: { type: String, default: "Bangladesh" },
      phone: String,
    },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    coupon: { type: couponSnapshotSchema, default: undefined },
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "BDT", uppercase: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled", "review"],
      default: "pending",
    },
    refundStatus: { type: String, enum: ["none", "pending", "partially_refunded", "refunded", "failed", "unknown"], default: "none" },
    refundedAmount: { type: Number, min: 0, default: 0 },
    refundPendingAmount: { type: Number, min: 0, default: 0 },
    extraRefundedAmount: { type: Number, min: 0, default: 0 },
    returnStatus: { type: String, default: "none" },
    issuedAt: { type: Date, default: Date.now },
    paidAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);

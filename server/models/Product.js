const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, default: 0, min: 0 },
    stock: { type: Number, required: true, default: 0, min: 0 },
    images: [{ type: String }],
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    // Keep a readable brand snapshot while linking new records to managed brands.
    brand: { type: String, default: "Generic", trim: true },
    brandRef: { type: mongoose.Schema.Types.ObjectId, ref: "Brand", default: null },
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

productSchema.index({ name: "text", description: "text" });
productSchema.index({ category: 1, brandRef: 1, createdAt: -1 });

productSchema.pre("validate", function () {
  if (this.discountPrice && this.discountPrice >= this.price) {
    this.invalidate("discountPrice", "Discount price must be lower than the regular price");
  }
});

module.exports = mongoose.model("Product", productSchema);

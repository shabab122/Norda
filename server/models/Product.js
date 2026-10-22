const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  sku: { type: String, required: true, uppercase: true, trim: true, maxlength: 64 },
  size: { type: String, default: "", maxlength: 40 }, color: { type: String, default: "", maxlength: 40 },
  price: { type: Number, required: true, min: 0.01 }, discountPrice: { type: Number, default: 0, min: 0 },
  lowStockThreshold: { type: Number, min: 0, default: 5 },
  stock: { type: Number, required: true, min: 0 }, images: [String], isActive: { type: Boolean, default: true },
});
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, default: 0, min: 0 },
    stock: { type: Number, required: true, default: 0, min: 0 },
    images: [{ type: String }],
    variants: { type: [variantSchema], default: [] },
    inventoryVersion: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, min: 0, default: 5 },
    lastInventoryImport: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryImport" },
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

productSchema.index({ "variants.sku": 1 }, { unique: true, partialFilterExpression: { "variants.sku": { $type: "string" } } });

productSchema.index({ name: "text", description: "text" });
productSchema.index({ category: 1, brandRef: 1, createdAt: -1 });

productSchema.pre("validate", function () {
  if (this.discountPrice && this.discountPrice >= this.price) {
    this.invalidate("discountPrice", "Discount price must be lower than the regular price");
  }
});

module.exports = mongoose.model("Product", productSchema);

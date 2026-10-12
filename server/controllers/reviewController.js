const { withOperationLock } = require("../services/operationLock");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Review = require("../models/Review");
const { cleanText } = require("../utils/validation");

const recalcProductRating = async (productId) => {
  const result = await Review.aggregate([
    { $match: { product: productId } },
    { $group: { _id: "$product", ratingAverage: { $avg: "$rating" }, ratingCount: { $sum: 1 } } },
  ]);
  const summary = result[0] || { ratingAverage: 0, ratingCount: 0 };
  await Product.findByIdAndUpdate(productId, {
    ratingAverage: Math.round(summary.ratingAverage * 10) / 10,
    ratingCount: summary.ratingCount,
  });
};

const createReview = async (req, res, next) => {
  try {
    const rating = Number(req.body.rating);
    if (!req.body.productId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "A product and rating from 1 to 5 are required" });
    }
    const product = await Product.findById(req.body.productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const purchased = await Order.exists({
      user: req.user._id,
      "items.product": product._id,
      status: "delivered",
    });
    if (!purchased) {
      return res.status(403).json({
        message: "Reviews are available after this product has been delivered to you",
      });
    }

    const review = await withOperationLock("rating:" + product._id, async () => {
      const saved = await Review.findOneAndUpdate(
      { product: product._id, user: req.user._id },
      {
        rating,
        comment: cleanText(req.body.comment, 1200),
        verifiedPurchase: true,
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
      await recalcProductRating(product._id);
      return saved;
    });
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
};

const getReviewsByProduct = async (req, res, next) => {
  try {
    const reviews = await Review.find({ product: req.params.productId })
      .populate("user", "name")
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    next(error);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    const isOwner = review.user.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    const productId = review.product;
    await withOperationLock("rating:" + productId, async () => {
      await review.deleteOne();
      await recalcProductRating(productId);
    });
    res.json({ message: "Review deleted" });
  } catch (error) {
    next(error);
  }
};

module.exports = { createReview, deleteReview, getReviewsByProduct };

const Brand = require("../models/Brand");
const Category = require("../models/Category");
const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");

const dashboardSummary = async (req, res, next) => {
  try {
    const [
      totalProducts,
      totalCategories,
      totalBrands,
      totalUsers,
      totalOrders,
      totalInvoices,
      pendingOrders,
      failedPayments,
      reviewPayments,
      lowStockProducts,
      revenueResult,
      statusResult,
      recentOrders,
    ] = await Promise.all([
      Product.countDocuments({ isArchived: { $ne: true } }),
      Category.countDocuments(),
      Brand.countDocuments(),
      User.countDocuments({ role: "user" }),
      Order.countDocuments(),
      Invoice.countDocuments(),
      Order.countDocuments({ status: "pending" }),
      Order.countDocuments({ paymentStatus: "failed" }),
      Order.countDocuments({ paymentStatus: "review" }),
      Product.find({ stock: { $lte: 5 }, isArchived: { $ne: true } }).select("name stock").sort({ stock: 1 }).limit(10),
      Order.aggregate([
        { $match: { isPaid: true, status: { $ne: "cancelled" }, paymentMethod: { $ne: "demo" } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.find()
        .populate("user", "name")
        .select("user totalAmount status paymentMethod paymentStatus createdAt")
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    const orderStatusCounts = statusResult.reduce((result, item) => {
      result[item._id] = item.count;
      return result;
    }, {});

    res.json({
      totalProducts,
      totalCategories,
      totalBrands,
      totalUsers,
      totalOrders,
      totalInvoices,
      totalRevenue: revenueResult[0]?.total || 0,
      pendingOrders,
      failedPayments,
      reviewPayments,
      lowStockProducts,
      orderStatusCounts,
      recentOrders,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { dashboardSummary };

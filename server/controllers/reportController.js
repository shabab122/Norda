const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const { rowsToCsv } = require("../utils/csv");

const orderReportCsv = async (req, res, next) => {
  try {
    for (const field of ["from", "to"]) {
      if (req.query[field] && (!/^\d{4}-\d{2}-\d{2}$/.test(req.query[field]) || !Number.isFinite(Date.parse(req.query[field])) || new Date(req.query[field]).toISOString().slice(0, 10) !== req.query[field])) {
        return res.status(400).json({ message: "Please provide valid report dates" });
      }
    }
    if (req.query.from && req.query.to && req.query.from > req.query.to) return res.status(400).json({ message: "The start date must be before the end date" });
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const end = new Date(req.query.to);
        end.setUTCHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const orders = await Order.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();
    const invoices = await Invoice.find({ order: { $in: orders.map((order) => order._id) } })
      .select("order invoiceNumber")
      .lean();
    const invoiceByOrder = new Map(
      invoices.map((invoice) => [invoice.order.toString(), invoice.invoiceNumber])
    );

    const headers = [
      { key: "orderId", label: "Order ID" },
      { key: "invoiceNumber", label: "Invoice" },
      { key: "createdAt", label: "Created At" },
      { key: "customer", label: "Customer" },
      { key: "email", label: "Email" },
      { key: "items", label: "Items" },
      { key: "paymentMethod", label: "Payment Method" },
      { key: "paymentStatus", label: "Payment Status" },
      { key: "orderStatus", label: "Order Status" },
      { key: "subtotal", label: "Subtotal" },
      { key: "shippingFee", label: "Shipping Fee" },
      { key: "total", label: "Total" },
      { key: "currency", label: "Currency" },
      { key: "refundedAmount", label: "Order Refund Completed" },
      { key: "extraRefundedAmount", label: "Additional Payment Refund" },
      { key: "refundPendingAmount", label: "Order Refund Pending" },
      { key: "refundStatus", label: "Refund Status" },
      { key: "netSales", label: "Net Sales (Excludes Review and Simulation)" },
    ];
    const rows = orders.map((order) => ({
      orderId: order._id,
      invoiceNumber: invoiceByOrder.get(order._id.toString()) || "",
      createdAt: new Date(order.createdAt).toISOString(),
      customer: order.user?.name || "Deleted user",
      email: order.user?.email || "",
      items: order.items.reduce((sum, item) => sum + item.quantity, 0),
      paymentMethod: order.paymentMethod === "demo" ? "DEMO / " + order.paymentChannel : order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      total: order.totalAmount,
      currency: order.currency,
      refundedAmount: order.refundedAmount || 0,
      extraRefundedAmount: order.extraRefundedAmount || 0,
      refundPendingAmount: order.refundPendingAmount || 0,
      refundStatus: order.refundStatus || "none",
      netSales: order.isPaid && order.paymentStatus === "paid" && order.status !== "cancelled" && order.paymentMethod !== "demo" ? Math.max(0, Number((order.totalAmount - (order.refundedAmount || 0)).toFixed(2))) : 0,
    }));

    const datePart = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="norda-orders-' + datePart + '.csv"');
    res.send("\uFEFF" + rowsToCsv(headers, rows));
  } catch (error) {
    next(error);
  }
};

module.exports = { orderReportCsv };

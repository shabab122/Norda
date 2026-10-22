const { pagination } = require("../utils/validation");
const Invoice = require("../models/Invoice");

const canView = (invoice, user) => {
  if (require("../utils/permissions").hasPermission(user, "orders")) return true;
  const ownerId = invoice.user?._id || invoice.user;
  return Boolean(ownerId && ownerId.toString() === user._id.toString());
};

const getMyInvoices = async (req, res, next) => {
  try {
    const invoices = await Invoice.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("order", "status paymentMethod paymentStatus");
    res.json(invoices);
  } catch (error) {
    next(error);
  }
};

const getInvoices = async (req, res, next) => {
  try {
    const { page, limit } = pagination(req.query);
    const filter = req.query.paymentStatus ? { paymentStatus: req.query.paymentStatus } : {};
    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate("user", "name email")
        .populate("order", "status paymentMethod")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Invoice.countDocuments(filter),
    ]);
    res.json({ invoices, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (error) {
    next(error);
  }
};

const getInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("user", "name email")
      .populate("order", "status paymentMethod paymentStatus createdAt");
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (!canView(invoice, req.user)) {
      return res.status(403).json({ message: "Not authorized to view this invoice" });
    }
    res.json(invoice);
  } catch (error) {
    next(error);
  }
};

const getInvoiceByOrder = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ order: req.params.orderId })
      .populate("user", "name email")
      .populate("order", "status paymentMethod paymentStatus createdAt");
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (!canView(invoice, req.user)) {
      return res.status(403).json({ message: "Not authorized to view this invoice" });
    }
    res.json(invoice);
  } catch (error) {
    next(error);
  }
};

module.exports = { getInvoice, getInvoiceByOrder, getInvoices, getMyInvoices };

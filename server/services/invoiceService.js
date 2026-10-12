const Invoice = require("../models/Invoice");
const { insertDocument, writeOptions } = require("./databaseUnit");

const createInvoiceNumber = (order) => {
  const datePart = new Date(order.createdAt || Date.now()).toISOString().slice(0, 10).replace(/-/g, "");
  return "NOR-" + datePart + "-" + order._id.toString().slice(-12).toUpperCase();
};

const createInvoiceForOrder = (order, session = null) => insertDocument(Invoice, {
  invoiceNumber: createInvoiceNumber(order),
  order: order._id,
  user: order.user,
  items: order.items.map((item) => ({
    product: item.product,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.price,
    lineTotal: Number((item.price * item.quantity).toFixed(2)),
  })),
  shippingAddress: order.shippingAddress,
  subtotal: order.subtotal,
  shippingFee: order.shippingFee,
  totalAmount: order.totalAmount,
  currency: order.currency,
  paymentStatus: order.paymentStatus,
}, session);

const syncInvoicePayment = (order, session = null) => Invoice.findOneAndUpdate(
  { order: order._id },
  { $set: { paymentStatus: order.paymentStatus, paidAt: order.isPaid ? order.paidAt || new Date() : null } },
  writeOptions(session, { new: true })
);

module.exports = { createInvoiceForOrder, createInvoiceNumber, syncInvoicePayment };

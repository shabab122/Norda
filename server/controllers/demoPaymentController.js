const demo = require("../services/demoPaymentService");

const initiate = async (req, res, next) => {
  try { res.status(201).json(await demo.initiateDemo({ user: req.user, shippingAddress: req.body.shippingAddress, checkoutKey: req.body.checkoutKey, channel: req.body.channel })); }
  catch (error) {
    if (error.orderId) return res.status(error.statusCode || 503).json({ message: "Your demo order was saved. Check My Orders before trying again.", orderId: error.orderId });
    next(error);
  }
};
const getSession = async (req, res, next) => {
  try { res.json(await demo.getDemo(req.user, req.params.orderId)); } catch (error) { next(error); }
};
const complete = async (req, res, next) => {
  try { res.json(await demo.completeDemo(req.user, req.params.orderId, req.body.outcome)); } catch (error) { next(error); }
};
module.exports = { initiate, getSession, complete };

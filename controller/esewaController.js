/**
 * eSewa Payment Controller
 * Standard eSewa integration for MERN stack
 */

const asyncHandler = require('express-async-handler');
const Order = require('../model/Order');

// eSewa config
const ESEWA_CONFIG = {
  merchantId: process.env.ESEWA_MERCHANT_ID || 'EPAYTEST',
  paymentUrl:
    process.env.NODE_ENV === 'production'
      ? 'https://epay.esewa.com.np/api/epay/main/v2/form'
      : 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
};

// Frontend URL
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Initiate eSewa payment
 * @route POST /api/esewa/initiate
 * @access Private
 */
const initiatePayment = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) throw new Error('Order ID is required');

  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  if (order.user.toString() !== req.user._id.toString())
    throw new Error('Not authorized to pay this order');

  if (order.paymentStatus === 'paid')
    throw new Error('Order already paid');

  if (order.paymentMethod !== 'esewa')
    throw new Error('Order is not set for eSewa payment');

  // Generate transaction ID
  const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  order.esewa = { transactionId };
  await order.save();

  // Return form data for frontend to POST to eSewa
  res.status(200).json({
    success: true,
    data: {
      paymentUrl: ESEWA_CONFIG.paymentUrl,
      formData: {
        amt: order.total.toString(),
        psc: '0',
        pdc: '0',
        txAmt: order.total.toString(),
        tAmt: order.total.toString(),
        pid: transactionId,
        scd: ESEWA_CONFIG.merchantId,
        su: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/esewa/success`,
        fu: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/esewa/failure`,
      },
    },
  });
});

/**
 * Success callback
 * @route POST /api/esewa/success
 * @access Public
 */
const successPayment = asyncHandler(async (req, res) => {
  const { amt, psc, pdc, txAmt, tAmt, pid, scd, refId } = req.body;

  const order = await Order.findOne({ 'esewa.transactionId': pid });
  if (!order) return res.redirect(`${FRONTEND_URL}/checkout?status=error&message=Order%20not%20found`);

  // Verify total
  if (parseFloat(tAmt) !== order.total) {
    order.paymentStatus = 'failed';
    await order.save();
    return res.redirect(`${FRONTEND_URL}/checkout?status=error&message=Amount%20mismatch`);
  }

  // Mark as paid
  order.paymentStatus = 'paid';
  order.esewa.refId = refId;
  await order.save();

  return res.redirect(`${FRONTEND_URL}/checkout?status=success&orderId=${order._id}`);
});

/**
 * Failure callback
 * @route POST /api/esewa/failure
 * @access Public
 */
const failurePayment = asyncHandler(async (req, res) => {
  const { pid } = req.body;

  const order = await Order.findOne({ 'esewa.transactionId': pid });
  if (order) {
    order.paymentStatus = 'failed';
    await order.save();
  }

  return res.redirect(`${FRONTEND_URL}/checkout?status=failed&message=Payment%20failed`);
});

/**
 * Check payment status
 * @route GET /api/esewa/status/:orderId
 * @access Private
 */
const checkPaymentStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) throw new Error('Order not found');

  if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin')
    throw new Error('Not authorized');

  res.status(200).json({
    success: true,
    data: {
      orderId: order._id,
      paymentStatus: order.paymentStatus,
      esewa: order.esewa,
    },
  });
});

module.exports = {
  initiatePayment,
  successPayment,
  failurePayment,
  checkPaymentStatus,
};

/**
 * eSewa Payment Controller
 * Handles eSewa payment initiation and verification
 *
 * Test Credentials:
 * - Merchant ID: EPAYTEST
 * - Secret Key: 8gBm/:&EnhH.1/q
 *
 * Test Environment URLs:
 * - Payment URL: https://rc-epay.esewa.com.np/api/epay/main/v2/form
 * - Verification URL: https://rc-epay.esewa.com.np/api/epay/transaction/status/
 */

const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const Order = require('../model/Order');

// eSewa Configuration
const ESEWA_CONFIG = {
  merchantId: process.env.ESEWA_MERCHANT_ID || 'EPAYTEST',
  secretKey: process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q',
  paymentUrl:
    process.env.NODE_ENV === 'production'
      ? 'https://epay.esewa.com.np/api/epay/main/v2/form'
      : 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
  verifyUrl:
    process.env.NODE_ENV === 'production'
      ? 'https://epay.esewa.com.np/api/epay/transaction/status/'
      : 'https://rc-epay.esewa.com.np/api/epay/transaction/status/',
};

// Frontend URLs for redirects
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Generate HMAC-SHA256 signature for eSewa
 * @param {string} message - The message to sign
 * @param {string} secret - The secret key
 * @returns {string} - Base64 encoded signature
 */
const generateSignature = (message, secret) => {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  return hmac.digest('base64');
};

/**
 * Generate transaction UUID
 * @returns {string} - Unique transaction ID
 */
const generateTransactionUuid = () => {
  return `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// @desc    Initiate eSewa payment
// @route   POST /api/esewa/initiate
// @access  Private
const initiatePayment = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    res.status(400);
    throw new Error('Order ID is required');
  }

  const order = await Order.findById(orderId);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Verify user owns this order
  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to pay for this order');
  }

  // Check if order is in pending payment state
  if (order.paymentStatus === 'paid') {
    res.status(400);
    throw new Error('This order has already been paid');
  }

  if (order.paymentMethod !== 'esewa') {
    res.status(400);
    throw new Error('This order is not set for eSewa payment');
  }

  // Generate unique transaction UUID
  const transactionUuid = generateTransactionUuid();

  // Prepare eSewa payment data
  const amount = order.total;
  const taxAmount = 0;
  const productServiceCharge = 0;
  const productDeliveryCharge = 0;
  const totalAmount = amount + taxAmount + productServiceCharge + productDeliveryCharge;

  // Generate signature
  // Message format: total_amount=X,transaction_uuid=Y,product_code=Z
  const signatureMessage = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${ESEWA_CONFIG.merchantId}`;
  const signature = generateSignature(signatureMessage, ESEWA_CONFIG.secretKey);

  // Callback URLs
  const successUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/esewa/verify`;
  const failureUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/esewa/failed`;

  // Update order with transaction UUID
  order.esewa = {
    transactionId: transactionUuid,
  };
  await order.save();

  // Return form data for frontend to submit
  res.status(200).json({
    success: true,
    message: 'Payment initiated',
    data: {
      paymentUrl: ESEWA_CONFIG.paymentUrl,
      formData: {
        amount: amount.toString(),
        tax_amount: taxAmount.toString(),
        product_service_charge: productServiceCharge.toString(),
        product_delivery_charge: productDeliveryCharge.toString(),
        total_amount: totalAmount.toString(),
        transaction_uuid: transactionUuid,
        product_code: ESEWA_CONFIG.merchantId,
        signature: signature,
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        success_url: successUrl,
        failure_url: failureUrl,
      },
    },
  });
});

// @desc    Verify eSewa payment (Success callback)
// @route   GET /api/esewa/verify
// @access  Public (eSewa redirects here)
const verifyPayment = asyncHandler(async (req, res) => {
  // eSewa sends data as base64 encoded JSON in 'data' query parameter
  const { data } = req.query;

  if (!data) {
    return res.redirect(`${FRONTEND_URL}/checkout?status=error&message=Invalid%20payment%20response`);
  }

  try {
    // Decode base64 data
    const decodedData = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
    const { transaction_uuid, status, total_amount, transaction_code, signed_field_names, signature } = decodedData;

    // Verify signature
    const signatureMessage = signed_field_names
      .split(',')
      .map((field) => `${field}=${decodedData[field]}`)
      .join(',');
    const expectedSignature = generateSignature(signatureMessage, ESEWA_CONFIG.secretKey);

    if (signature !== expectedSignature) {
      console.error('eSewa signature verification failed');
      return res.redirect(`${FRONTEND_URL}/checkout?status=error&message=Payment%20verification%20failed`);
    }

    // Find order by transaction UUID
    const order = await Order.findOne({ 'esewa.transactionId': transaction_uuid });

    if (!order) {
      console.error('Order not found for transaction:', transaction_uuid);
      return res.redirect(`${FRONTEND_URL}/checkout?status=error&message=Order%20not%20found`);
    }

    // Verify amount matches
    if (parseFloat(total_amount) !== order.total) {
      console.error('Amount mismatch:', total_amount, order.total);
      return res.redirect(`${FRONTEND_URL}/checkout?status=error&message=Amount%20mismatch`);
    }

    // Check payment status
    if (status === 'COMPLETE') {
      // Mark order as paid
      await order.markAsPaid({
        transactionId: transaction_uuid,
        refId: transaction_code,
        amount: parseFloat(total_amount),
      });

      // Redirect to success page
      return res.redirect(`${FRONTEND_URL}/checkout?status=success&orderId=${order._id}&orderNumber=${order.orderNumber}`);
    } else {
      // Payment not complete
      order.paymentStatus = 'failed';
      await order.save();
      return res.redirect(`${FRONTEND_URL}/checkout?status=failed&message=Payment%20was%20not%20completed`);
    }
  } catch (error) {
    console.error('eSewa verification error:', error);
    return res.redirect(`${FRONTEND_URL}/checkout?status=error&message=Payment%20verification%20error`);
  }
});

// @desc    Handle eSewa payment failure
// @route   GET /api/esewa/failed
// @access  Public (eSewa redirects here)
const handleFailure = asyncHandler(async (req, res) => {
  const { data } = req.query;

  if (data) {
    try {
      const decodedData = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
      const { transaction_uuid } = decodedData;

      // Update order payment status
      if (transaction_uuid) {
        const order = await Order.findOne({ 'esewa.transactionId': transaction_uuid });
        if (order) {
          order.paymentStatus = 'failed';
          await order.save();
        }
      }
    } catch (error) {
      console.error('Error processing failed payment:', error);
    }
  }

  // Redirect to frontend with error
  res.redirect(`${FRONTEND_URL}/checkout?status=failed&message=Payment%20was%20cancelled%20or%20failed`);
});

// @desc    Check payment status
// @route   GET /api/esewa/status/:orderId
// @access  Private
const checkPaymentStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Verify user owns this order
  if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to check this order');
  }

  res.status(200).json({
    success: true,
    data: {
      orderId: order._id,
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      esewa: order.esewa,
    },
  });
});

module.exports = {
  initiatePayment,
  verifyPayment,
  handleFailure,
  checkPaymentStatus,
};

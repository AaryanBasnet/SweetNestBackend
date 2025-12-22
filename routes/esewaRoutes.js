/**
 * eSewa Payment Routes
 * Handles eSewa payment initiation and callbacks
 */

const express = require('express');
const router = express.Router();
const {
  initiatePayment,
  verifyPayment,
  handleFailure,
  checkPaymentStatus,
} = require('../controller/esewaController');
const { protect } = require('../middleware/authMiddleware');

// Payment initiation (requires auth)
router.post('/initiate', protect, initiatePayment);

// Payment callbacks (public - eSewa redirects here)
router.get('/verify', verifyPayment);
router.get('/failed', handleFailure);

// Check payment status (requires auth)
router.get('/status/:orderId', protect, checkPaymentStatus);

module.exports = router;

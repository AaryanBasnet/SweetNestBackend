const express = require('express');
const router = express.Router();
const {
  initiatePayment,
  successPayment,
  failurePayment,
  checkPaymentStatus,
} = require('../controller/esewaController');
const { protect } = require('../middleware/authMiddleware');

// Payment initiation (requires auth)
router.post('/initiate', protect, initiatePayment);

// Payment callbacks (public - eSewa POSTs here)
router.post('/success', successPayment);
router.post('/failure', failurePayment);

// Check payment status (requires auth)
router.get('/status/:orderId', protect, checkPaymentStatus);

module.exports = router;

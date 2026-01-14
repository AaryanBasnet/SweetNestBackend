/**
 * Rewards Routes
 * Routes for SweetPoints and coupon management
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const rewardsController = require('../controller/rewardsController');

// Public routes
router.get('/tiers', rewardsController.getRewardTiers);

// Protected routes (require authentication)
router.use(protect);

router.get('/points', rewardsController.getUserPoints);
router.post('/redeem', rewardsController.redeemPoints);
router.get('/coupons', rewardsController.getUserCoupons);
router.get('/validate/:code', rewardsController.validateCoupon);

module.exports = router;

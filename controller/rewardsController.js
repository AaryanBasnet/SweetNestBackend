/**
 * Rewards Controller
 * Handles SweetPoints and coupon redemption
 */

const asyncHandler = require('express-async-handler');
const User = require('../model/User');
const Coupon = require('../model/Coupon');
const Order = require('../model/Order');
const { getRewardTier, getAllRewardTiers, calculatePointsEarned } = require('../config/rewards');

/**
 * @desc    Get all available reward tiers
 * @route   GET /api/rewards/tiers
 * @access  Public
 */
exports.getRewardTiers = asyncHandler(async (req, res) => {
  const tiers = getAllRewardTiers();

  // If user is logged in, include their current points
  let userPoints = 0;
  if (req.user) {
    const user = await User.findById(req.user._id).select('sweetPoints');
    userPoints = user?.sweetPoints || 0;
  }

  res.status(200).json({
    success: true,
    message: 'Reward tiers fetched successfully',
    data: {
      tiers,
      userPoints,
    },
  });
});

/**
 * @desc    Get user's SweetPoints balance and history
 * @route   GET /api/rewards/points
 * @access  Private
 */
exports.getUserPoints = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('sweetPoints pointsHistory')
    .lean();

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  res.status(200).json({
    success: true,
    message: 'Points fetched successfully',
    data: {
      balance: user.sweetPoints || 0,
      history: user.pointsHistory || [],
    },
  });
});

/**
 * @desc    Redeem points for a coupon
 * @route   POST /api/rewards/redeem
 * @access  Private
 */
exports.redeemPoints = asyncHandler(async (req, res) => {
  const { tierId } = req.body;

  if (!tierId) {
    res.status(400);
    throw new Error('Reward tier ID is required');
  }

  // Get reward tier configuration
  const tier = getRewardTier(tierId);
  if (!tier) {
    res.status(400);
    throw new Error('Invalid reward tier');
  }

  // Get user
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Check if user has enough points
  if (user.sweetPoints < tier.pointsCost) {
    res.status(400);
    throw new Error(
      `Insufficient points. You need ${tier.pointsCost} points but have ${user.sweetPoints}`
    );
  }

  // Calculate expiry date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + tier.validityDays);

  // Create coupon
  const coupon = await Coupon.create({
    user: user._id,
    discountType: tier.discountType,
    discountValue: tier.discountValue,
    maxDiscount: tier.maxDiscount,
    minOrderAmount: tier.minOrderAmount,
    rewardTier: {
      name: tier.name,
      pointsCost: tier.pointsCost,
    },
    expiresAt,
  });

  // Deduct points from user
  user.sweetPoints -= tier.pointsCost;
  user.pointsHistory.push({
    amount: -tier.pointsCost,
    type: 'redeemed',
    description: `Redeemed ${tier.name} coupon`,
    relatedCoupon: coupon._id,
  });

  await user.save();

  res.status(201).json({
    success: true,
    message: 'Points redeemed successfully',
    data: {
      coupon: {
        _id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscount: coupon.maxDiscount,
        minOrderAmount: coupon.minOrderAmount,
        rewardTier: coupon.rewardTier,
        expiresAt: coupon.expiresAt,
      },
      remainingPoints: user.sweetPoints,
    },
  });
});

/**
 * @desc    Get user's coupons
 * @route   GET /api/rewards/coupons
 * @access  Private
 */
exports.getUserCoupons = asyncHandler(async (req, res) => {
  const { status } = req.query; // 'active', 'used', 'expired', or 'all'

  let query = { user: req.user._id };

  if (status === 'active') {
    query.isUsed = false;
    query.expiresAt = { $gt: new Date() };
  } else if (status === 'used') {
    query.isUsed = true;
  } else if (status === 'expired') {
    query.isUsed = false;
    query.expiresAt = { $lte: new Date() };
  }

  const coupons = await Coupon.find(query)
    .select('-__v')
    .sort({ createdAt: -1 })
    .lean();

  // Categorize coupons
  const now = new Date();
  const categorized = {
    active: coupons.filter((c) => !c.isUsed && new Date(c.expiresAt) > now),
    used: coupons.filter((c) => c.isUsed),
    expired: coupons.filter((c) => !c.isUsed && new Date(c.expiresAt) <= now),
  };

  res.status(200).json({
    success: true,
    message: 'Coupons fetched successfully',
    data: {
      coupons: status === 'all' || !status ? categorized : coupons,
      total: coupons.length,
    },
  });
});

/**
 * @desc    Validate and get coupon details by code
 * @route   GET /api/rewards/validate/:code
 * @access  Private
 */
exports.validateCoupon = asyncHandler(async (req, res) => {
  const { code } = req.params;

  if (!code) {
    res.status(400);
    throw new Error('Coupon code is required');
  }

  const coupon = await Coupon.findOne({
    code: code.toUpperCase(),
    user: req.user._id,
  }).lean();

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  // Check if expired
  if (new Date(coupon.expiresAt) <= new Date()) {
    res.status(400);
    throw new Error('Coupon has expired');
  }

  // Check if already used
  if (coupon.isUsed) {
    res.status(400);
    throw new Error('Coupon already used');
  }

  res.status(200).json({
    success: true,
    message: 'Coupon is valid',
    data: {
      coupon: {
        _id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscount: coupon.maxDiscount,
        minOrderAmount: coupon.minOrderAmount,
        expiresAt: coupon.expiresAt,
      },
      isValid: true,
    },
  });
});

/**
 * @desc    Award points to user (called internally after order completion)
 * @route   POST /api/rewards/award (Internal use)
 * @access  Private (Should be called from order controller)
 */
exports.awardPoints = async (userId, orderId, orderAmount) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found for awarding points');
      return { success: false };
    }

    // Check if it's first order
    const orderCount = await Order.countDocuments({
      user: userId,
      orderStatus: { $nin: ['cancelled'] },
    });
    const isFirstOrder = orderCount === 1;

    // Calculate points earned
    const pointsEarned = calculatePointsEarned(orderAmount, isFirstOrder);

    // Add points to user
    user.sweetPoints += pointsEarned;
    user.pointsHistory.push({
      amount: pointsEarned,
      type: 'earned',
      description: isFirstOrder
        ? `Earned from first order + bonus`
        : `Earned from order`,
      relatedOrder: orderId,
    });

    await user.save();

    console.log(`Awarded ${pointsEarned} points to user ${userId}`);
    return { success: true, pointsEarned };
  } catch (error) {
    console.error('Error awarding points:', error);
    return { success: false, error: error.message };
  }
};

module.exports = exports;

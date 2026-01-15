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
  console.log("--- REDEEM START ---");
  const { tierId } = req.body;
  
  // 1. Validate Input
  if (!tierId) {
    res.status(400);
    throw new Error('Reward tier ID is required');
  }

  // 2. Get Tier Data
  const tier = getRewardTier(tierId); 
  if (!tier) {
    res.status(400);
    throw new Error('Invalid reward tier');
  }
  console.log("Tier found:", tier.name);

  // 3. Get User
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  console.log("User found:", user._id, "Points:", user.sweetPoints);

  // 4. Check Balance
  if (user.sweetPoints < tier.pointsCost) {
    res.status(400);
    throw new Error(`Insufficient points. Need ${tier.pointsCost}, have ${user.sweetPoints}`);
  }

  // 5. Calculate Expiry
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + tier.validityDays);

  console.log("Creating Coupon Object...");

  try {
    // 6. Create Coupon (Model will auto-generate 'code' via pre-save hook)
    const coupon = await Coupon.create({
      user: user._id,
      // code: ... WE DO NOT PASS CODE HERE, let the Model generate it
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
    
    console.log("Coupon Created Successfully:", coupon.code);

    // 7. Deduct Points & Update History
    user.sweetPoints -= tier.pointsCost;
    
    // Ensure pointsHistory array exists
    if (!user.pointsHistory) user.pointsHistory = [];
    
    user.pointsHistory.push({
      amount: -tier.pointsCost,
      type: 'redeemed',
      description: `Redeemed ${tier.name} coupon`,
      relatedCoupon: coupon._id,
    });

    await user.save();
    console.log("User Points Updated.");

    // 8. Send Response
    res.status(201).json({
      success: true,
      message: 'Points redeemed successfully',
      data: {
        coupon: {
          _id: coupon._id,
          code: coupon.code, // Send back the auto-generated code
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

  } catch (error) {
    console.log("!!! REDEEM CRASH !!!");
    console.log("Error Name:", error.name);
    console.log("Error Message:", error.message);
    
    // Check for Mongoose Validation Errors
    if (error.errors) {
       console.log("Validation Details:", JSON.stringify(error.errors, null, 2));
    }
    
    res.status(500).json({ 
        message: "Redemption Failed", 
        error: error.message 
    });
  }
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
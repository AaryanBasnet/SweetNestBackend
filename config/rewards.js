/**
 * Rewards Configuration
 * Defines reward tiers and points earning rules
 */

// Reward tiers - points required to redeem coupons
const REWARD_TIERS = [
  {
    id: 'bronze',
    name: 'Bronze Reward',
    pointsCost: 100,
    discountType: 'percentage',
    discountValue: 5,
    maxDiscount: 100,
    minOrderAmount: 500,
    description: '5% off on orders above Rs. 500',
    validityDays: 30,
  },
  {
    id: 'silver',
    name: 'Silver Reward',
    pointsCost: 250,
    discountType: 'percentage',
    discountValue: 10,
    maxDiscount: 250,
    minOrderAmount: 1000,
    description: '10% off on orders above Rs. 1000',
    validityDays: 45,
  },
  {
    id: 'gold',
    name: 'Gold Reward',
    pointsCost: 500,
    discountType: 'percentage',
    discountValue: 15,
    maxDiscount: 500,
    minOrderAmount: 1500,
    description: '15% off on orders above Rs. 1500',
    validityDays: 60,
  },
  {
    id: 'platinum',
    name: 'Platinum Reward',
    pointsCost: 1000,
    discountType: 'percentage',
    discountValue: 20,
    maxDiscount: 1000,
    minOrderAmount: 2000,
    description: '20% off on orders above Rs. 2000',
    validityDays: 90,
  },
];

// Points earning rules
const POINTS_RULES = {
  // Earn 1 point for every Rs. 10 spent
  SPENDING_RATIO: 10, // Rs. 10 = 1 point

  // Bonus points for completing first order
  FIRST_ORDER_BONUS: 50,

  // Bonus points for orders above certain amounts
  ORDER_MILESTONES: [
    { amount: 1000, bonus: 20 },
    { amount: 2000, bonus: 50 },
    { amount: 5000, bonus: 100 },
  ],
};

// Calculate points earned from order amount
function calculatePointsEarned(orderAmount, isFirstOrder = false) {
  let points = 0;

  // Base points from spending
  points += Math.floor(orderAmount / POINTS_RULES.SPENDING_RATIO);

  // First order bonus
  if (isFirstOrder) {
    points += POINTS_RULES.FIRST_ORDER_BONUS;
  }

  // Milestone bonuses
  for (const milestone of POINTS_RULES.ORDER_MILESTONES) {
    if (orderAmount >= milestone.amount) {
      points += milestone.bonus;
    }
  }

  return points;
}

// Get reward tier by ID
function getRewardTier(tierId) {
  return REWARD_TIERS.find((tier) => tier.id === tierId);
}

// Get all available reward tiers
function getAllRewardTiers() {
  return REWARD_TIERS;
}

module.exports = {
  REWARD_TIERS,
  POINTS_RULES,
  calculatePointsEarned,
  getRewardTier,
  getAllRewardTiers,
};

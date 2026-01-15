/**
 * Coupon Model
 * Stores user-earned coupons from SweetPoints redemption
 */

const mongoose = require('mongoose');

// Helper function to generate coupon code
function generateCouponCode() {
  const prefix = 'SWEET';
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${randomStr}`;
}

const couponSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      default: generateCouponCode, // ✅ FIX 1: Generate code automatically here
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    maxDiscount: {
      type: Number,
      default: null,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
    },
    rewardTier: {
      name: { type: String, required: true },
      pointsCost: { type: Number, required: true },
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    usedInOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
couponSchema.index({ user: 1, isUsed: 1, expiresAt: 1 });
couponSchema.index({ code: 1 });

// ❌ DELETED: The broken pre('validate') hook is gone.
// We rely on 'default: generateCouponCode' above instead.

// Method to check if coupon is valid
couponSchema.methods.isValid = function () {
  return !this.isUsed && new Date() < this.expiresAt;
};

// Method to mark coupon as used
couponSchema.methods.markAsUsed = async function (orderId) {
  this.isUsed = true;
  this.usedAt = new Date();
  this.usedInOrder = orderId;
  await this.save();
};

const Coupon = mongoose.model('Coupon', couponSchema);
module.exports = Coupon;
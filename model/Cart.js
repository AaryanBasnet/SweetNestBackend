/**
 * Cart Model
 * Stores user's shopping cart
 * Supports both guest (via localStorage) and logged-in users (server-synced)
 */

const mongoose = require('mongoose');
const pricing = require('../services/pricingService');

const cartItemSchema = new mongoose.Schema(
  {
    cake: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cake',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      max: [10, 'Quantity cannot exceed 10'],
      default: 1,
    },
    // Selected weight option
    selectedWeight: {
      weightInKg: {
        type: Number,
        required: true,
      },
      label: {
        type: String,
        required: true,
      },
      price: {
        type: Number,
        required: true,
      },
    },
    // Optional customization
    customization: {
      message: String,
      specialInstructions: String,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: [cartItemSchema],
    // Delivery preference
    deliveryType: {
      type: String,
      enum: ['delivery', 'pickup'],
      default: 'delivery',
    },
    // Applied promo code.
    //
    // maxDiscount and couponId were previously assigned by the controller but
    // never declared here, so Mongoose silently dropped them on save. The
    // consequences were real: the cap on a percentage discount never applied
    // (WELCOME20 gave Rs 2,000 off a Rs 10,000 order instead of Rs 200), and
    // without couponId nothing could mark an earned coupon as used, so the
    // same coupon worked on unlimited orders.
    promoCode: {
      code: String,
      discount: Number,
      discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
      },
      // Upper limit on a percentage discount, in rupees.
      maxDiscount: Number,
      // Set when the code is a coupon the user earned, so it can be consumed
      // when the order is placed.
      couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon',
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ---------------------------------------------------------------------------
// Money.
//
// These virtuals delegate to the pricing service rather than doing the
// arithmetic themselves. The rules used to live here, in the controller and
// in the schema all at once, and they disagreed - which is how a discount cap
// came to be advertised but never applied. One implementation, one place.
// ---------------------------------------------------------------------------

cartSchema.virtual('totals').get(function () {
  return pricing.calculateTotals({
    items: this.items,
    deliveryType: this.deliveryType,
    promoCode: this.promoCode,
  });
});

cartSchema.virtual('subtotal').get(function () {
  return this.totals.subtotal;
});

cartSchema.virtual('shipping').get(function () {
  return this.totals.shipping;
});

cartSchema.virtual('discountAmount').get(function () {
  return this.totals.discount;
});

cartSchema.virtual('tax').get(function () {
  return this.totals.tax;
});

cartSchema.virtual('total').get(function () {
  return this.totals.total;
});

cartSchema.virtual('itemCount').get(function () {
  return this.totals.itemCount;
});

// Index for faster queries
// NOTE: no explicit index on `user` - `unique: true` on the field already
// creates one. Declaring both makes Mongoose warn about a duplicate index.

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;

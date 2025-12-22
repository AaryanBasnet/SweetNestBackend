/**
 * Cart Model
 * Stores user's shopping cart
 * Supports both guest (via localStorage) and logged-in users (server-synced)
 */

const mongoose = require('mongoose');

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
    // Applied promo code
    promoCode: {
      code: String,
      discount: Number,
      discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: Calculate subtotal
cartSchema.virtual('subtotal').get(function () {
  return this.items.reduce((total, item) => {
    return total + item.selectedWeight.price * item.quantity;
  }, 0);
});

// Virtual: Calculate shipping (example: Rs. 100 for delivery, 0 for pickup)
cartSchema.virtual('shipping').get(function () {
  return this.deliveryType === 'delivery' ? 100 : 0;
});

// Virtual: Calculate discount
cartSchema.virtual('discountAmount').get(function () {
  if (!this.promoCode?.code) return 0;
  if (this.promoCode.discountType === 'percentage') {
    return Math.round((this.subtotal * this.promoCode.discount) / 100);
  }
  return this.promoCode.discount || 0;
});

// Virtual: Calculate total
cartSchema.virtual('total').get(function () {
  return this.subtotal + this.shipping - this.discountAmount;
});

// Virtual: Item count
cartSchema.virtual('itemCount').get(function () {
  return this.items.reduce((count, item) => count + item.quantity, 0);
});

// Index for faster queries
cartSchema.index({ user: 1 });

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;

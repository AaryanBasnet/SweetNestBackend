/**
 * Order Model
 * Stores order information including items, shipping, payment details
 */

const mongoose = require('mongoose');

// Order item sub-schema
const orderItemSchema = new mongoose.Schema(
  {
    cake: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cake',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    weight: {
      weightInKg: { type: Number, required: true },
      label: { type: String, required: true },
      price: { type: Number, required: true },
    },
    customizations: [
      {
        name: String,
        selectedOption: String,
        priceAdjustment: { type: Number, default: 0 },
      },
    ],
    itemTotal: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

// Shipping address sub-schema
const shippingAddressSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    apartment: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    postalCode: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
  },
  { _id: false }
);

// Delivery schedule sub-schema
const deliveryScheduleSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Delivery date is required'],
    },
    timeSlot: {
      type: String,
      required: [true, 'Delivery time slot is required'],
      enum: ['09:00 AM - 12:00 PM', '12:00 PM - 03:00 PM', '03:00 PM - 06:00 PM'],
    },
  },
  { _id: false }
);

// eSewa payment details sub-schema
const esewaDetailsSchema = new mongoose.Schema(
  {
    transactionId: String,
    refId: String,
    amount: Number,
    paidAt: Date,
  },
  { _id: false }
);

// Main Order schema
const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: 'Order must have at least one item',
      },
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },
    contactEmail: {
      type: String,
      required: [true, 'Contact email is required'],
      lowercase: true,
      trim: true,
    },
    deliverySchedule: {
      type: deliveryScheduleSchema,
      required: true,
    },
    specialRequests: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    subscribeNewsletter: {
      type: Boolean,
      default: false,
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['esewa', 'cod'],
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    orderStatus: {
      type: String,
      required: true,
      enum: ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled'],
      default: 'pending',
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    shipping: {
      type: Number,
      required: true,
      default: 100,
    },
    discount: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    promoCode: {
      code: String,
      discount: Number,
      discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
      },
    },
    esewa: esewaDetailsSchema,
    notes: {
      type: String,
      trim: true,
    },
    cancelledAt: Date,
    cancelReason: String,
    deliveredAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

// Virtual: Get formatted delivery date
orderSchema.virtual('formattedDeliveryDate').get(function () {
  if (!this.deliverySchedule?.date) return null;
  const date = new Date(this.deliverySchedule.date);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

// Virtual: Get item count
orderSchema.virtual('itemCount').get(function () {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Virtual: Check if order can be cancelled
orderSchema.virtual('canBeCancelled').get(function () {
  return ['pending', 'confirmed'].includes(this.orderStatus);
});

// Pre-save: Validate delivery date is in the future
orderSchema.pre('save', async function () {
  if (this.isNew && this.deliverySchedule?.date) {
    const deliveryDate = new Date(this.deliverySchedule.date);
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 1); // At least tomorrow
    minDate.setHours(0, 0, 0, 0);

    if (deliveryDate < minDate) {
      throw new Error('Delivery date must be at least 24 hours from now');
    }
  }
});

// Static: Generate unique order number
orderSchema.statics.generateOrderNumber = async function () {
  const prefix = 'SN';
  let orderNumber;
  let exists = true;

  while (exists) {
    const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit random
    orderNumber = `${prefix}-${randomNum}`;
    exists = await this.findOne({ orderNumber });
  }

  return orderNumber;
};

// Static: Get orders by status
orderSchema.statics.getByStatus = function (status) {
  return this.find({ orderStatus: status }).sort({ createdAt: -1 });
};

// Method: Update order status with timestamp
orderSchema.methods.updateStatus = async function (newStatus, notes = '') {
  const validTransitions = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'cancelled'],
    processing: ['out_for_delivery', 'cancelled'],
    out_for_delivery: ['delivered'],
    delivered: [],
    cancelled: [],
  };

  if (!validTransitions[this.orderStatus]?.includes(newStatus)) {
    throw new Error(`Cannot transition from ${this.orderStatus} to ${newStatus}`);
  }

  this.orderStatus = newStatus;

  if (newStatus === 'cancelled') {
    this.cancelledAt = new Date();
    this.cancelReason = notes;
  } else if (newStatus === 'delivered') {
    this.deliveredAt = new Date();
  }

  if (notes && newStatus !== 'cancelled') {
    this.notes = notes;
  }

  return this.save();
};

// Method: Mark payment as completed
orderSchema.methods.markAsPaid = async function (esewaDetails = {}) {
  this.paymentStatus = 'paid';
  if (Object.keys(esewaDetails).length > 0) {
    this.esewa = {
      ...esewaDetails,
      paidAt: new Date(),
    };
  }
  // Auto-confirm order when paid
  if (this.orderStatus === 'pending') {
    this.orderStatus = 'confirmed';
  }
  return this.save();
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;

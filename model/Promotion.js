/**
 * Promotion Model
 * Manages seasonal promotions and banner campaigns
 */

const mongoose = require('mongoose');

// Sub-schema for images (Cloudinary)
const imageSchema = new mongoose.Schema(
  {
    public_id: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

// Main Promotion Schema
const promotionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Promotion title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },

    // Images for the promotion carousel
    images: {
      type: [imageSchema],
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: 'At least one image is required',
      },
    },

    // Date range for auto-scheduling
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
      validate: {
        validator: function (v) {
          return v > this.startDate;
        },
        message: 'End date must be after start date',
      },
    },

    // Season tags
    seasonTag: {
      type: String,
      enum: ['spring', 'summer', 'autumn', 'winter', 'holiday', 'all-season'],
      default: 'all-season',
      index: true,
    },

    // Optional: Link to specific cake products
    linkedCakes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cake',
    }],

    // Optional: Link to category
    linkedCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
    },

    // Call-to-action
    ctaText: {
      type: String,
      default: 'VIEW DETAILS',
      maxlength: [30, 'CTA text cannot exceed 30 characters'],
    },
    ctaLink: {
      type: String,
      trim: true,
      maxlength: [200, 'CTA link cannot exceed 200 characters'],
    },

    // Priority for display order (higher number = higher priority)
    priority: {
      type: Number,
      default: 0,
      index: true,
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: Check if promotion is currently active based on dates
promotionSchema.virtual('isCurrentlyActive').get(function () {
  const now = new Date();
  return this.isActive && this.startDate <= now && this.endDate >= now;
});

// Indexes for efficient queries
promotionSchema.index({ startDate: 1, endDate: 1 });
promotionSchema.index({ isActive: 1, priority: -1 });
promotionSchema.index({ seasonTag: 1, isActive: 1 });

const Promotion = mongoose.model('Promotion', promotionSchema);

module.exports = Promotion;

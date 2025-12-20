/**
 * Review Model
 * References Cake and User by ObjectId only (loose coupling)
 * Based on UI: Customer Reviews section
 */

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    // Reference to Cake (ObjectId only - atomic)
    cake: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cake',
      required: [true, 'Cake reference is required'],
      index: true,
    },

    // Reference to User (ObjectId only - atomic)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },

    // Rating (1-5 stars)
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },

    // Review text
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      trim: true,
      maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    },

    // Reviewer display name (denormalized for performance)
    reviewerName: {
      type: String,
      required: true,
      trim: true,
    },

    // Review status
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: true, // Auto-approve or set to false for moderation
    },

    // Helpful votes
    helpfulCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one review per user per cake
reviewSchema.index({ cake: 1, user: 1 }, { unique: true });

// Index for fetching approved reviews
reviewSchema.index({ cake: 1, isApproved: 1, createdAt: -1 });

// Static method: Calculate average rating for a cake
reviewSchema.statics.calculateAverageRating = async function (cakeId) {
  const stats = await this.aggregate([
    { $match: { cake: cakeId, isApproved: true } },
    {
      $group: {
        _id: '$cake',
        avgRating: { $avg: '$rating' },
        numRatings: { $sum: 1 },
      },
    },
  ]);

  // Update the Cake document (using ObjectId reference)
  if (stats.length > 0) {
    await mongoose.model('Cake').findByIdAndUpdate(cakeId, {
      ratingsAverage: stats[0].avgRating,
      ratingsCount: stats[0].numRatings,
    });
  } else {
    await mongoose.model('Cake').findByIdAndUpdate(cakeId, {
      ratingsAverage: 0,
      ratingsCount: 0,
    });
  }
};

// Post-save: Recalculate cake rating
reviewSchema.post('save', function () {
  this.constructor.calculateAverageRating(this.cake);
});

// Post-remove: Recalculate cake rating
reviewSchema.post('findOneAndDelete', function (doc) {
  if (doc) {
    doc.constructor.calculateAverageRating(doc.cake);
  }
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;

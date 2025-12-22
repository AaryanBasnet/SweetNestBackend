/**
 * Wishlist Model
 * Stores user's favorite cakes
 * Supports both guest (via localStorage) and logged-in users (server-synced)
 */

const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema(
  {
    cake: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cake',
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    // Optional: reminder for special dates
    reminder: {
      enabled: {
        type: Boolean,
        default: false,
      },
      date: Date,
      note: String,
    },
  },
  { _id: false }
);

const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: [wishlistItemSchema],
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
wishlistSchema.index({ user: 1 });

const Wishlist = mongoose.model('Wishlist', wishlistSchema);

module.exports = Wishlist;

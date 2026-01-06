/**
 * Notification Model
 * Stores user and admin notifications
 */

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // Recipient (null for global/broadcast notifications)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Notification type
    type: {
      type: String,
      enum: ['order', 'offer', 'reminder', 'alert', 'system'],
      required: true,
    },

    // Category for filtering
    category: {
      type: String,
      enum: ['orders', 'offers', 'all'],
      default: 'all',
    },

    // Icon type for UI
    iconType: {
      type: String,
      enum: ['delivery', 'gift', 'clock', 'star', 'info', 'warning', 'success'],
      default: 'info',
    },

    // Icon background color
    iconColor: {
      type: String,
      enum: ['green', 'orange', 'blue', 'purple', 'red', 'gray'],
      default: 'blue',
    },

    // Notification content
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: 100,
    },

    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: 500,
    },

    // Optional action
    actionText: {
      type: String,
      trim: true,
      maxlength: 50,
    },

    actionUrl: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    // Related entity (order, product, etc.)
    relatedEntity: {
      entityType: {
        type: String,
        enum: ['order', 'product', 'user', 'none'],
        default: 'none',
      },
      entityId: {
        type: mongoose.Schema.Types.ObjectId,
      },
    },

    // Read status
    isRead: {
      type: Boolean,
      default: false,
    },

    // Read timestamp
    readAt: {
      type: Date,
      default: null,
    },

    // For admin notifications only
    isAdminNotification: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ isAdminNotification: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;

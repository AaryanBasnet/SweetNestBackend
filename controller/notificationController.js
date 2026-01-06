/**
 * Notification Controller
 * Handles notification CRUD operations
 */

const asyncHandler = require('express-async-handler');
const Notification = require('../model/Notification');

/**
 * @desc    Get user notifications
 * @route   GET /api/notifications
 * @access  Private
 */
const getNotifications = asyncHandler(async (req, res) => {
  const { category, unreadOnly, limit = 50 } = req.query;
  const userId = req.user._id;

  // Build query
  const query = {
    $or: [{ user: userId }, { user: null }], // User-specific or broadcast
  };

  // Filter by category
  if (category && category !== 'all') {
    query.category = category;
  }

  // Filter by read status
  if (unreadOnly === true || unreadOnly === 'true') {
    query.isRead = false;
  }

  // Only user notifications (not admin)
  query.isAdminNotification = false;

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .lean();

  res.status(200).json({
    success: true,
    count: notifications.length,
    data: notifications,
  });
});

/**
 * @desc    Get admin notifications
 * @route   GET /api/notifications/admin
 * @access  Private/Admin
 */
const getAdminNotifications = asyncHandler(async (req, res) => {
  const { unreadOnly, limit = 50 } = req.query;

  const query = { isAdminNotification: true };

  if (unreadOnly === true || unreadOnly === 'true') {
    query.isRead = false;
  }

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .populate('user', 'name email')
    .lean();

  res.status(200).json({
    success: true,
    count: notifications.length,
    data: notifications,
  });
});

/**
 * @desc    Get unread count
 * @route   GET /api/notifications/unread-count
 * @access  Private
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const count = await Notification.countDocuments({
    $or: [{ user: userId }, { user: null }],
    isRead: false,
    isAdminNotification: false,
  });

  res.status(200).json({
    success: true,
    data: { count },
  });
});

/**
 * @desc    Get admin unread count
 * @route   GET /api/notifications/admin/unread-count
 * @access  Private/Admin
 */
const getAdminUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    isAdminNotification: true,
    isRead: false,
  });

  res.status(200).json({
    success: true,
    data: { count },
  });
});

/**
 * @desc    Create notification (admin only)
 * @route   POST /api/notifications
 * @access  Private/Admin
 */
const createNotification = asyncHandler(async (req, res) => {
  const notificationData = { ...req.body };

  // If userId provided, set it; otherwise it's a broadcast (null)
  if (req.body.userId) {
    notificationData.user = req.body.userId;
  }

  const notification = await Notification.create(notificationData);

  res.status(201).json({
    success: true,
    message: 'Notification created successfully',
    data: notification,
  });
});

/**
 * @desc    Mark notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const notification = await Notification.findById(id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  // Check ownership (user's notification or broadcast)
  if (notification.user && notification.user.toString() !== userId.toString()) {
    res.status(403);
    throw new Error('Not authorized to access this notification');
  }

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
    data: notification,
  });
});

/**
 * @desc    Mark all notifications as read
 * @route   PATCH /api/notifications/mark-all-read
 * @access  Private
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { category } = req.body;

  const query = {
    $or: [{ user: userId }, { user: null }],
    isRead: false,
    isAdminNotification: false,
  };

  if (category && category !== 'all') {
    query.category = category;
  }

  const result = await Notification.updateMany(query, {
    isRead: true,
    readAt: new Date(),
  });

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} notifications marked as read`,
    data: { modifiedCount: result.modifiedCount },
  });
});

/**
 * @desc    Delete notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const notification = await Notification.findById(id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  // Check ownership
  if (notification.user && notification.user.toString() !== userId.toString()) {
    res.status(403);
    throw new Error('Not authorized to delete this notification');
  }

  await notification.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Notification deleted successfully',
  });
});

/**
 * @desc    Delete all read notifications
 * @route   DELETE /api/notifications/clear-read
 * @access  Private
 */
const clearReadNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const result = await Notification.deleteMany({
    user: userId,
    isRead: true,
    isAdminNotification: false,
  });

  res.status(200).json({
    success: true,
    message: `${result.deletedCount} notifications cleared`,
    data: { deletedCount: result.deletedCount },
  });
});

module.exports = {
  getNotifications,
  getAdminNotifications,
  getUnreadCount,
  getAdminUnreadCount,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
};

/**
 * Notification Routes
 * All routes require authentication
 */

const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const {
  createNotificationSchema,
  getNotificationsSchema,
  markAsReadSchema,
  markAllAsReadSchema,
  deleteNotificationSchema,
} = require('../validators/notificationValidators');
const {
  getNotifications,
  getAdminNotifications,
  getUnreadCount,
  getAdminUnreadCount,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
} = require('../controller/notificationController');

// User routes
router.get('/', protect, validate(getNotificationsSchema), getNotifications);
router.get('/unread-count', protect, getUnreadCount);
router.patch('/:id/read', protect, validate(markAsReadSchema), markAsRead);
router.patch('/mark-all-read', protect, validate(markAllAsReadSchema), markAllAsRead);
router.delete('/:id', protect, validate(deleteNotificationSchema), deleteNotification);
router.delete('/clear-read/all', protect, clearReadNotifications);

// Admin routes
router.post('/', protect, admin, validate(createNotificationSchema), createNotification);
router.get('/admin/all', protect, admin, getAdminNotifications);
router.get('/admin/unread-count', protect, admin, getAdminUnreadCount);

module.exports = router;

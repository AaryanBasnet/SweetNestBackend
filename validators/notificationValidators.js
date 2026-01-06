/**
 * Notification Validators
 * Zod validation schemas for notification endpoints
 */

const { z } = require('zod');

// Create notification schema (admin only)
const createNotificationSchema = z.object({
  body: z.object({
    userId: z.string().optional(), // If null, it's a broadcast notification
    type: z.enum(['order', 'offer', 'reminder', 'alert', 'system']),
    category: z.enum(['orders', 'offers', 'all']).default('all'),
    iconType: z
      .enum(['delivery', 'gift', 'clock', 'star', 'info', 'warning', 'success'])
      .default('info'),
    iconColor: z
      .enum(['green', 'orange', 'blue', 'purple', 'red', 'gray'])
      .default('blue'),
    title: z
      .string({ required_error: 'Title is required' })
      .min(1, 'Title is required')
      .max(100, 'Title must be at most 100 characters')
      .trim(),
    message: z
      .string({ required_error: 'Message is required' })
      .min(1, 'Message is required')
      .max(500, 'Message must be at most 500 characters')
      .trim(),
    actionText: z.string().max(50).trim().optional().or(z.literal('')),
    actionUrl: z.string().max(200).trim().optional().or(z.literal('')),
    relatedEntity: z
      .object({
        entityType: z.enum(['order', 'product', 'user', 'none']).default('none'),
        entityId: z.string().optional(),
      })
      .optional(),
    isAdminNotification: z.boolean().default(false),
  }),
});

// Get notifications query schema
const getNotificationsSchema = z.object({
  query: z.object({
    category: z.enum(['all', 'orders', 'offers']).optional(),
    unreadOnly: z
      .string()
      .transform((val) => val === 'true')
      .optional(),
    limit: z
      .string()
      .transform((val) => parseInt(val, 10))
      .optional(),
  }),
});

// Mark as read schema
const markAsReadSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Notification ID is required' }),
  }),
});

// Mark all as read schema
const markAllAsReadSchema = z.object({
  body: z.object({
    category: z.enum(['all', 'orders', 'offers']).optional(),
  }),
});

// Delete notification schema
const deleteNotificationSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Notification ID is required' }),
  }),
});

module.exports = {
  createNotificationSchema,
  getNotificationsSchema,
  markAsReadSchema,
  markAllAsReadSchema,
  deleteNotificationSchema,
};

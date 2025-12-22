/**
 * Order Validation Schemas
 * Zod schemas for order-related requests
 */

const { z } = require('zod');

// Shipping address schema
const shippingAddressSchema = z.object({
  firstName: z
    .string({ required_error: 'First name is required' })
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters')
    .trim(),
  lastName: z
    .string({ required_error: 'Last name is required' })
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters')
    .trim(),
  address: z
    .string({ required_error: 'Address is required' })
    .min(1, 'Address is required')
    .max(200, 'Address cannot exceed 200 characters')
    .trim(),
  apartment: z.string().max(100).trim().optional(),
  city: z
    .string({ required_error: 'City is required' })
    .min(1, 'City is required')
    .max(100, 'City cannot exceed 100 characters')
    .trim(),
  postalCode: z.string().max(20).trim().optional(),
  phone: z
    .string({ required_error: 'Phone number is required' })
    .min(10, 'Phone number must be at least 10 digits')
    .max(20, 'Phone number cannot exceed 20 characters')
    .trim(),
});

// Delivery schedule schema
const deliveryScheduleSchema = z.object({
  date: z
    .string({ required_error: 'Delivery date is required' })
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid delivery date',
    }),
  timeSlot: z.enum(['09:00 AM - 12:00 PM', '12:00 PM - 03:00 PM', '03:00 PM - 06:00 PM'], {
    required_error: 'Please select a delivery time slot',
  }),
});

// Create order schema
const createOrderSchema = z.object({
  body: z.object({
    contactEmail: z
      .string({ required_error: 'Email is required' })
      .email('Please enter a valid email')
      .trim()
      .toLowerCase(),
    shippingAddress: shippingAddressSchema,
    deliverySchedule: deliveryScheduleSchema,
    specialRequests: z.string().max(500, 'Special requests cannot exceed 500 characters').trim().optional(),
    subscribeNewsletter: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === 'true')
      .optional()
      .default(false),
    paymentMethod: z.enum(['esewa', 'cod'], {
      required_error: 'Payment method is required',
    }),
  }),
});

// Get order by ID schema
const getOrderByIdSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Order ID is required' })
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid order ID format'),
  }),
});

// Update order status schema
const updateOrderStatusSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Order ID is required' })
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid order ID format'),
  }),
  body: z.object({
    status: z.enum(['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled'], {
      required_error: 'Status is required',
    }),
    notes: z.string().max(500).trim().optional(),
  }),
});

// Get orders query schema
const getOrdersQuerySchema = z.object({
  query: z.object({
    page: z
      .string()
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().min(1))
      .optional()
      .default('1'),
    limit: z
      .string()
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().min(1).max(50))
      .optional()
      .default('10'),
    status: z
      .enum(['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled'])
      .optional(),
    paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
    sort: z.string().optional(),
  }),
});

// Cancel order schema
const cancelOrderSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Order ID is required' })
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid order ID format'),
  }),
  body: z.object({
    reason: z.string().min(1, 'Cancellation reason is required').max(500).trim(),
  }),
});

module.exports = {
  createOrderSchema,
  getOrderByIdSchema,
  updateOrderStatusSchema,
  getOrdersQuerySchema,
  cancelOrderSchema,
};

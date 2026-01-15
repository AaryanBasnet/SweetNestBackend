/**
 * Order Routes
 * Handles order CRUD operations
 */

const express = require('express');
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrderById,
  getOrderByNumber,
  updateOrderStatus,
  cancelOrder,
  processRefund,
  getAllOrders,
  getOrderStats,
} = require('../controller/orderController');
const { protect, admin } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');
const {
  createOrderSchema,
  getOrderByIdSchema,
  updateOrderStatusSchema,
  getOrdersQuerySchema,
  cancelOrderSchema,
} = require('../validators/orderValidators');

// User routes (protected)
router.post('/', protect, validate(createOrderSchema), createOrder);
router.get('/', protect, validate(getOrdersQuerySchema), getMyOrders);
router.get('/number/:orderNumber', protect, getOrderByNumber);
router.get('/:id', protect, validate(getOrderByIdSchema), getOrderById);
router.put('/:id/cancel', protect, validate(cancelOrderSchema), cancelOrder);

// Admin routes
router.get('/admin/all', protect, admin, validate(getOrdersQuerySchema), getAllOrders);
router.get('/admin/stats', protect, admin, getOrderStats);
router.put('/:id/status', protect, admin, validate(updateOrderStatusSchema), updateOrderStatus);
router.put('/:id/refund', protect, admin, processRefund);

module.exports = router;

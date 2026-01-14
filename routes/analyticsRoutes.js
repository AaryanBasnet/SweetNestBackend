/**
 * Analytics Routes
 * Admin-only analytics and reporting endpoints
 */

const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
  getOverviewAnalytics,
  getRevenueTrends,
  getTopProducts,
  getCategoryPerformance,
  getCustomerAnalytics,
  getTimeTrends,
  getOrderStatusBreakdown,
  getRecentActivity,
} = require('../controller/analyticsController');

// All analytics routes require admin authentication
router.use(protect, admin);

// Overview stats
router.get('/overview', getOverviewAnalytics);

// Revenue analytics
router.get('/revenue-trends', getRevenueTrends);

// Product analytics
router.get('/top-products', getTopProducts);

// Category analytics
router.get('/categories', getCategoryPerformance);

// Customer analytics
router.get('/customers', getCustomerAnalytics);

// Time-based trends
router.get('/time-trends', getTimeTrends);

// Order status breakdown
router.get('/order-status', getOrderStatusBreakdown);

// Recent activity
router.get('/recent-activity', getRecentActivity);

module.exports = router;

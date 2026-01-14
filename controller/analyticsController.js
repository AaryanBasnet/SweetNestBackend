/**
 * Analytics Controller
 * Comprehensive analytics and reporting for admin dashboard
 */

const asyncHandler = require('express-async-handler');
const Order = require('../model/Order');
const User = require('../model/User');
const Cake = require('../model/Cake');
const Category = require('../model/Category');
const Review = require('../model/Review');
const mongoose = require('mongoose');

/**
 * @desc    Get overview analytics (main dashboard stats)
 * @route   GET /api/analytics/overview
 * @access  Private/Admin
 */
const getOverviewAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  // Date range setup - if no dates provided, get ALL data
  let matchStage = {};
  let previousMatchStage = {};

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Current period
    matchStage.createdAt = { $gte: start, $lte: end };

    // Calculate previous period for comparison
    const periodLength = end - start;
    const previousStart = new Date(start.getTime() - periodLength);
    const previousEnd = start;
    previousMatchStage.createdAt = { $gte: previousStart, $lt: previousEnd };
  }

  // Current period stats
  const [currentStats] = await Order.aggregate([
    { $match: matchStage },
    { $unwind: '$items' },
    {
      $group: {
        _id: null,
        totalOrders: { $addToSet: '$_id' },
        totalRevenue: {
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] },
        },
        paidOrders: {
          $addToSet: {
            $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$_id', null],
          },
        },
        pendingOrders: {
          $addToSet: {
            $cond: [{ $eq: ['$orderStatus', 'pending'] }, '$_id', null],
          },
        },
        deliveredOrders: {
          $addToSet: {
            $cond: [{ $eq: ['$orderStatus', 'delivered'] }, '$_id', null],
          },
        },
        totalItemsQuantity: { $sum: '$items.quantity' },
      },
    },
    {
      $project: {
        totalOrders: { $size: '$totalOrders' },
        totalRevenue: 1,
        paidOrders: {
          $size: {
            $filter: {
              input: '$paidOrders',
              as: 'order',
              cond: { $ne: ['$$order', null] },
            },
          },
        },
        pendingOrders: {
          $size: {
            $filter: {
              input: '$pendingOrders',
              as: 'order',
              cond: { $ne: ['$$order', null] },
            },
          },
        },
        deliveredOrders: {
          $size: {
            $filter: {
              input: '$deliveredOrders',
              as: 'order',
              cond: { $ne: ['$$order', null] },
            },
          },
        },
        totalItems: '$totalItemsQuantity',
      },
    },
  ]);

  // Previous period stats for comparison (only if date range is specified)
  let previousStats = null;
  if (startDate && endDate) {
    const [stats] = await Order.aggregate([
      { $match: previousMatchStage },
      {
        $group: {
          _id: null,
          totalOrders: { $addToSet: '$_id' },
          totalRevenue: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] },
          },
        },
      },
      {
        $project: {
          totalOrders: { $size: '$totalOrders' },
          totalRevenue: 1,
        },
      },
    ]);
    previousStats = stats;
  }

  // Customers
  const totalCustomers = await User.countDocuments({ role: 'user' });

  let newCustomers = 0;
  let previousNewCustomers = 0;

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const periodLength = end - start;
    const previousStart = new Date(start.getTime() - periodLength);

    newCustomers = await User.countDocuments({
      role: 'user',
      createdAt: { $gte: start, $lte: end },
    });

    previousNewCustomers = await User.countDocuments({
      role: 'user',
      createdAt: { $gte: previousStart, $lt: start },
    });
  }

  // Calculate percentage changes
  const calculateChange = (current, previous) => {
    if (!previous || previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const current = currentStats || {
    totalOrders: 0,
    totalRevenue: 0,
    paidOrders: 0,
    pendingOrders: 0,
    deliveredOrders: 0,
    totalItems: 0,
  };

  const previous = previousStats || { totalOrders: 0, totalRevenue: 0 };

  res.status(200).json({
    success: true,
    data: {
      revenue: {
        current: current.totalRevenue,
        change: calculateChange(current.totalRevenue, previous.totalRevenue),
      },
      orders: {
        current: current.totalOrders,
        change: calculateChange(current.totalOrders, previous.totalOrders),
        pending: current.pendingOrders,
        delivered: current.deliveredOrders,
      },
      customers: {
        total: totalCustomers,
        new: newCustomers,
        change: calculateChange(newCustomers, previousNewCustomers),
      },
      products: {
        sold: current.totalItems,
      },
      averageOrderValue:
        current.paidOrders > 0 ? current.totalRevenue / current.paidOrders : 0,
    },
  });
});

/**
 * @desc    Get revenue trends (daily/weekly/monthly)
 * @route   GET /api/analytics/revenue-trends
 * @access  Private/Admin
 */
const getRevenueTrends = asyncHandler(async (req, res) => {
  const { period = 'daily', limit = 30 } = req.query;

  let groupBy;
  let dateFormat;
  let startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(limit));

  switch (period) {
    case 'daily':
      groupBy = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      };
      dateFormat = '%Y-%m-%d';
      break;
    case 'weekly':
      groupBy = {
        year: { $year: '$createdAt' },
        week: { $week: '$createdAt' },
      };
      dateFormat = 'Week %V, %Y';
      startDate.setDate(startDate.getDate() + parseInt(limit));
      startDate.setDate(startDate.getDate() - parseInt(limit) * 7);
      break;
    case 'monthly':
      groupBy = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      };
      dateFormat = '%Y-%m';
      startDate.setDate(startDate.getDate() + parseInt(limit));
      startDate.setMonth(startDate.getMonth() - parseInt(limit));
      break;
    default:
      groupBy = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      };
      dateFormat = '%Y-%m-%d';
  }

  const trends = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        paymentStatus: 'paid',
      },
    },
    {
      $group: {
        _id: groupBy,
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
        date: { $first: '$createdAt' },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
    { $limit: parseInt(limit) },
    {
      $project: {
        _id: 0,
        date: {
          $dateToString: {
            format: dateFormat,
            date: '$date',
          },
        },
        revenue: 1,
        orders: 1,
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: trends,
  });
});

/**
 * @desc    Get top selling products
 * @route   GET /api/analytics/top-products
 * @access  Private/Admin
 */
const getTopProducts = asyncHandler(async (req, res) => {
  const { limit = 10, startDate, endDate } = req.query;

  const matchStage = {
    paymentStatus: 'paid',
  };

  if (startDate && endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  const topProducts = await Order.aggregate([
    { $match: matchStage },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.cake',
        productName: { $first: '$items.name' },
        productImage: { $first: '$items.image' },
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.itemTotal' },
        orderCount: { $addToSet: '$_id' },
      },
    },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name: '$productName',
        image: '$productImage',
        quantitySold: '$totalQuantity',
        revenue: '$totalRevenue',
        orders: { $size: '$orderCount' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: parseInt(limit) },
  ]);

  res.status(200).json({
    success: true,
    data: topProducts,
  });
});

/**
 * @desc    Get category performance
 * @route   GET /api/analytics/categories
 * @access  Private/Admin
 */
const getCategoryPerformance = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const matchStage = {
    paymentStatus: 'paid',
  };

  if (startDate && endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  // Use aggregation to get category performance
  const categoryData = await Order.aggregate([
    { $match: matchStage },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'cakes',
        localField: 'items.cake',
        foreignField: '_id',
        as: 'cakeInfo',
      },
    },
    { $unwind: { path: '$cakeInfo', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'categories',
        localField: 'cakeInfo.category',
        foreignField: '_id',
        as: 'categoryInfo',
      },
    },
    { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$categoryInfo._id',
        name: { $first: '$categoryInfo.name' },
        revenue: { $sum: '$items.itemTotal' },
        quantity: { $sum: '$items.quantity' },
        orders: { $sum: 1 },
      },
    },
    {
      $match: {
        name: { $exists: true, $ne: null },
      },
    },
  ]);

  // Calculate total revenue for percentages
  const totalRevenue = categoryData.reduce((sum, cat) => sum + cat.revenue, 0);

  // Add percentages and sort
  const categories = categoryData
    .map((cat) => ({
      name: cat.name,
      revenue: cat.revenue,
      quantity: cat.quantity,
      orders: cat.orders,
      percentage: totalRevenue > 0 ? (cat.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  res.status(200).json({
    success: true,
    data: categories,
  });
});

/**
 * @desc    Get customer analytics
 * @route   GET /api/analytics/customers
 * @access  Private/Admin
 */
const getCustomerAnalytics = asyncHandler(async (req, res) => {
  // Total customers
  const totalCustomers = await User.countDocuments({ role: 'user' });

  // Customers with orders (aggregation)
  const customerStats = await Order.aggregate([
    {
      $group: {
        _id: '$user',
        orderCount: { $sum: 1 },
        totalSpent: {
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] },
        },
        lastOrderDate: { $max: '$createdAt' },
      },
    },
  ]);

  // Calculate metrics
  const customersWithOrders = customerStats.length;
  const repeatCustomers = customerStats.filter((c) => c.orderCount > 1).length;
  const totalRevenue = customerStats.reduce((sum, c) => sum + c.totalSpent, 0);
  const avgLifetimeValue =
    customersWithOrders > 0 ? totalRevenue / customersWithOrders : 0;
  const repeatRate =
    customersWithOrders > 0 ? (repeatCustomers / customersWithOrders) * 100 : 0;

  // Top customers
  const topCustomers = await Order.aggregate([
    { $match: { paymentStatus: 'paid' } },
    {
      $group: {
        _id: '$user',
        totalSpent: { $sum: '$total' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { totalSpent: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userInfo',
      },
    },
    { $unwind: '$userInfo' },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        name: '$userInfo.name',
        email: '$userInfo.email',
        totalSpent: 1,
        orderCount: 1,
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: {
      total: totalCustomers,
      withOrders: customersWithOrders,
      repeatCustomers,
      repeatRate,
      avgLifetimeValue,
      topCustomers,
    },
  });
});

/**
 * @desc    Get time-based analytics (best days, hours, etc.)
 * @route   GET /api/analytics/time-trends
 * @access  Private/Admin
 */
const getTimeTrends = asyncHandler(async (req, res) => {
  // Best performing days of the week
  const dayPerformance = await Order.aggregate([
    { $match: { paymentStatus: 'paid' } },
    {
      $group: {
        _id: { $dayOfWeek: '$createdAt' },
        orders: { $sum: 1 },
        revenue: { $sum: '$total' },
      },
    },
    { $sort: { revenue: -1 } },
    {
      $project: {
        _id: 0,
        day: {
          $switch: {
            branches: [
              { case: { $eq: ['$_id', 1] }, then: 'Sunday' },
              { case: { $eq: ['$_id', 2] }, then: 'Monday' },
              { case: { $eq: ['$_id', 3] }, then: 'Tuesday' },
              { case: { $eq: ['$_id', 4] }, then: 'Wednesday' },
              { case: { $eq: ['$_id', 5] }, then: 'Thursday' },
              { case: { $eq: ['$_id', 6] }, then: 'Friday' },
              { case: { $eq: ['$_id', 7] }, then: 'Saturday' },
            ],
            default: 'Unknown',
          },
        },
        orders: 1,
        revenue: 1,
      },
    },
  ]);

  // Monthly performance (last 12 months)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const monthlyPerformance = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'paid',
        createdAt: { $gte: twelveMonthsAgo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        orders: { $sum: 1 },
        revenue: { $sum: '$total' },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
    {
      $project: {
        _id: 0,
        month: {
          $switch: {
            branches: [
              { case: { $eq: ['$_id.month', 1] }, then: 'January' },
              { case: { $eq: ['$_id.month', 2] }, then: 'February' },
              { case: { $eq: ['$_id.month', 3] }, then: 'March' },
              { case: { $eq: ['$_id.month', 4] }, then: 'April' },
              { case: { $eq: ['$_id.month', 5] }, then: 'May' },
              { case: { $eq: ['$_id.month', 6] }, then: 'June' },
              { case: { $eq: ['$_id.month', 7] }, then: 'July' },
              { case: { $eq: ['$_id.month', 8] }, then: 'August' },
              { case: { $eq: ['$_id.month', 9] }, then: 'September' },
              { case: { $eq: ['$_id.month', 10] }, then: 'October' },
              { case: { $eq: ['$_id.month', 11] }, then: 'November' },
              { case: { $eq: ['$_id.month', 12] }, then: 'December' },
            ],
            default: 'Unknown',
          },
        },
        year: '$_id.year',
        orders: 1,
        revenue: 1,
      },
    },
  ]);

  // Best and worst performing day
  const best = dayPerformance[0] || null;
  const worst = dayPerformance[dayPerformance.length - 1] || null;

  res.status(200).json({
    success: true,
    data: {
      dailyPerformance: dayPerformance,
      monthlyPerformance,
      bestDay: best,
      worstDay: worst,
    },
  });
});

/**
 * @desc    Get order status breakdown
 * @route   GET /api/analytics/order-status
 * @access  Private/Admin
 */
const getOrderStatusBreakdown = asyncHandler(async (req, res) => {
  const statusBreakdown = await Order.aggregate([
    {
      $group: {
        _id: '$orderStatus',
        count: { $sum: 1 },
        totalValue: { $sum: '$total' },
      },
    },
    {
      $project: {
        _id: 0,
        status: '$_id',
        count: 1,
        totalValue: 1,
      },
    },
  ]);

  const paymentBreakdown = await Order.aggregate([
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        totalValue: {
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        method: '$_id',
        count: 1,
        totalValue: 1,
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: {
      orderStatus: statusBreakdown,
      paymentMethods: paymentBreakdown,
    },
  });
});

/**
 * @desc    Get recent activity
 * @route   GET /api/analytics/recent-activity
 * @access  Private/Admin
 */
const getRecentActivity = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  const recentOrders = await Order.find()
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .populate('user', 'name email')
    .select('orderNumber total orderStatus paymentStatus createdAt')
    .lean();

  const recentCustomers = await User.find({ role: 'user' })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .select('name email createdAt')
    .lean();

  const pendingReviews = await Review.countDocuments({ isApproved: false });

  res.status(200).json({
    success: true,
    data: {
      recentOrders,
      recentCustomers,
      pendingReviews,
    },
  });
});

module.exports = {
  getOverviewAnalytics,
  getRevenueTrends,
  getTopProducts,
  getCategoryPerformance,
  getCustomerAnalytics,
  getTimeTrends,
  getOrderStatusBreakdown,
  getRecentActivity,
};

/**
 * Order Controller
 * CRUD operations for orders
 */

const asyncHandler = require("express-async-handler");
const Order = require("../model/Order");
const {
  getPaginationOptions,
  buildPaginationMeta,
} = require("../utils/pagination");
const { awardPoints } = require("./rewardsController");
const orderService = require("../services/orderService");
const logger = require("../config/logger");

// @desc    Create new order from cart
// @route   POST /api/orders
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  // The handler does three things: take the request apart, call the service,
  // and shape the reply. Every rule about what an order costs and what
  // happens to the cart and the coupon lives in orderService.
  const order = await orderService.createOrderFromCart(req.user._id, req.body);

  res.status(201).json({
    success: true,
    message: 'Order created successfully',
    data: order,
  });
});

// @desc    Get logged-in user's orders
// @route   GET /api/orders
// @access  Private
const getMyOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationOptions(req.query);
  const { status, paymentStatus } = req.query;

  const filter = { user: req.user._id };

  if (status) filter.orderStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;

  const [orders, totalItems] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-__v"),
    Order.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(totalItems, page, limit);

  res.status(200).json({
    success: true,
    message: "Orders fetched successfully",
    data: orders,
    pagination,
  });
});

// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("user", "name email")
    .select("-__v");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Check if user owns this order (unless admin)
  if (
    order.user._id.toString() !== req.user._id.toString() &&
    req.user.role !== "admin"
  ) {
    res.status(403);
    throw new Error("Not authorized to access this order");
  }

  res.status(200).json({
    success: true,
    message: "Order fetched successfully",
    data: order,
  });
});

// @desc    Get order by order number
// @route   GET /api/orders/number/:orderNumber
// @access  Private
const getOrderByNumber = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber })
    .populate("user", "name email")
    .select("-__v");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Check if user owns this order (unless admin)
  if (
    order.user._id.toString() !== req.user._id.toString() &&
    req.user.role !== "admin"
  ) {
    res.status(403);
    throw new Error("Not authorized to access this order");
  }

  res.status(200).json({
    success: true,
    message: "Order fetched successfully",
    data: order,
  });
});

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.paymentStatus === "failed" && status !== "cancelled") {
    res.status(400);
    throw new Error(
      "Cannot process an order with failed payment. Please create a new order."
    );
  }

  const previousStatus = order.orderStatus;

  try {
    await order.updateStatus(status, notes);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }

  // Award SweetPoints when order is delivered
  if (status === "delivered" && previousStatus !== "delivered") {
    try {
      await awardPoints(order.user.toString(), order._id, order.total);
      logger.info(
        { orderNumber: order.orderNumber, orderId: order._id },
        "Awarded reward points for delivered order"
      );
    } catch (error) {
      logger.error(
        { err: error, orderId: order._id },
        "Failed to award reward points"
      );
      // Don't fail the order status update if points awarding fails
    }
  }

  res.status(200).json({
    success: true,
    message: `Order status updated to ${status}`,
    data: order,
  });
});

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
const cancelOrder = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Check if user owns this order
  if (
    order.user.toString() !== req.user._id.toString() &&
    req.user.role !== "admin"
  ) {
    res.status(403);
    throw new Error("Not authorized to cancel this order");
  }

  // Check if order can be cancelled
  if (!order.canBeCancelled) {
    res.status(400);
    throw new Error("This order cannot be cancelled");
  }

  try {
    await order.updateStatus("cancelled", reason);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }

  // TODO: If paid with eSewa, initiate refund

  res.status(200).json({
    success: true,
    message: "Order cancelled successfully",
    data: order,
  });
});

// @desc    Process refund for an order (Admin)
// @route   PUT /api/orders/:id/refund
// @access  Private/Admin
const processRefund = asyncHandler(async (req, res) => {
  const { amount, reason, notes } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Check if order can be refunded
  if (order.paymentStatus !== "paid") {
    res.status(400);
    throw new Error("Can only refund orders that have been paid");
  }

  // Validate refund amount if provided
  if (amount && amount > order.total) {
    res.status(400);
    throw new Error("Refund amount cannot exceed order total");
  }

  try {
    await order.processRefund({
      amount: amount || order.total,
      reason: reason || "Customer requested refund",
      notes: notes || "",
      adminId: req.user._id,
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }

  // Populate for response
  await order.populate("refundedBy", "name email");

  res.status(200).json({
    success: true,
    message: "Refund processed successfully. Please complete the refund manually via eSewa dashboard or bank transfer.",
    data: order,
  });
});

// @desc    Get all orders (Admin)
// @route   GET /api/orders/all
// @access  Private/Admin
// orderController.js

// @desc    Get all orders (Admin)
// @route   GET /api/orders/all
const getAllOrders = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    paymentStatus,
    search,
    sort,
  } = req.query;

  // 1. Base Filter
  const filter = {};

  // 2. Add Status Filters
  if (status) filter.orderStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;

  // 3. Add Search Logic (Search by Order Number or User Email)
  if (search) {
    // We need to look up users first if we want to search by email/name
    // OR just search by Order Number directly
    const searchRegex = { $regex: search, $options: "i" };

    // Simple search: Order Number OR Promo Code
    filter.$or = [{ orderNumber: searchRegex }, { promoCode: searchRegex }];

    // NOTE: Searching by User Name in a referenced collection (populate)
    // is complex in Mongoose. Usually, it's better to just search Order ID.
  }

  // 4. Calculate Skip
  const skip = (page - 1) * limit;

  // 5. Fetch Data
  const orders = await Order.find(filter)
    .populate("user", "name email")
    .sort(sort || { createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  // 6. Count Total (for Pagination)
  const total = await Order.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: orders,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalItems: total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get order statistics (Admin)
// @route   GET /api/orders/stats
// @access  Private/Admin
const getOrderStats = asyncHandler(async (req, res) => {
  const stats = await Order.aggregate([
    {
      $facet: {
        byStatus: [{ $group: { _id: "$orderStatus", count: { $sum: 1 } } }],
        byPaymentStatus: [
          { $group: { _id: "$paymentStatus", count: { $sum: 1 } } },
        ],
        byPaymentMethod: [
          { $group: { _id: "$paymentMethod", count: { $sum: 1 } } },
        ],
        totals: [
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalRevenue: {
                $sum: {
                  $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$total", 0],
                },
              },
              averageOrderValue: { $avg: "$total" },
            },
          },
        ],
        recentOrders: [
          { $sort: { createdAt: -1 } },
          { $limit: 5 },
          {
            $project: {
              orderNumber: 1,
              total: 1,
              orderStatus: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
  ]);

  res.status(200).json({
    success: true,
    message: "Order statistics fetched successfully",
    data: stats[0],
  });
});

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  getOrderByNumber,
  updateOrderStatus,
  cancelOrder,
  processRefund,
  getAllOrders,
  getOrderStats,
};

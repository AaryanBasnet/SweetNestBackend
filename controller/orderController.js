/**
 * Order Controller
 * CRUD operations for orders
 */

const asyncHandler = require('express-async-handler');
const Order = require('../model/Order');
const Cart = require('../model/Cart');
const { getPaginationOptions, buildPaginationMeta, getSortOptions } = require('../utils/pagination');

// @desc    Create new order from cart
// @route   POST /api/orders
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Get user's cart with populated cake data
  const cart = await Cart.findOne({ user: userId }).populate({
    path: 'items.cake',
    select: 'name images slug',
  });

  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error('Your cart is empty');
  }

  const {
    contactEmail,
    shippingAddress,
    deliverySchedule,
    specialRequests,
    subscribeNewsletter,
    paymentMethod,
  } = req.body;

  // Generate unique order number
  const orderNumber = await Order.generateOrderNumber();

  // Build order items from cart
  const orderItems = cart.items.map((item) => ({
    cake: item.cake._id,
    name: item.cake.name,
    image: item.cake.images?.[0]?.url || '',
    quantity: item.quantity,
    weight: {
      weightInKg: item.selectedWeight.weightInKg,
      label: item.selectedWeight.label,
      price: item.selectedWeight.price,
    },
    customizations: item.customization
      ? [
          {
            name: 'Custom Message',
            selectedOption: item.customization.message || '',
            priceAdjustment: 0,
          },
        ]
      : [],
    itemTotal: item.selectedWeight.price * item.quantity,
  }));

  // Calculate totals
  const subtotal = cart.subtotal;
  const shipping = cart.shipping;
  const discount = cart.discountAmount;
  const total = cart.total;

  // Create order
  const order = await Order.create({
    orderNumber,
    user: userId,
    items: orderItems,
    shippingAddress,
    contactEmail,
    deliverySchedule: {
      date: new Date(deliverySchedule.date),
      timeSlot: deliverySchedule.timeSlot,
    },
    specialRequests,
    subscribeNewsletter,
    paymentMethod,
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
    orderStatus: paymentMethod === 'cod' ? 'confirmed' : 'pending',
    subtotal,
    shipping,
    discount,
    total,
    promoCode: cart.promoCode || null,
  });

  // Clear the cart after successful order creation
  await Cart.findOneAndUpdate({ user: userId }, { items: [], promoCode: null });

  // Populate for response
  await order.populate('user', 'name email');

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
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-__v'),
    Order.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(totalItems, page, limit);

  res.status(200).json({
    success: true,
    message: 'Orders fetched successfully',
    data: orders,
    pagination,
  });
});

// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email')
    .select('-__v');

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Check if user owns this order (unless admin)
  if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to access this order');
  }

  res.status(200).json({
    success: true,
    message: 'Order fetched successfully',
    data: order,
  });
});

// @desc    Get order by order number
// @route   GET /api/orders/number/:orderNumber
// @access  Private
const getOrderByNumber = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber })
    .populate('user', 'name email')
    .select('-__v');

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Check if user owns this order (unless admin)
  if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to access this order');
  }

  res.status(200).json({
    success: true,
    message: 'Order fetched successfully',
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
    throw new Error('Order not found');
  }

  try {
    await order.updateStatus(status, notes);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
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
    throw new Error('Order not found');
  }

  // Check if user owns this order
  if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to cancel this order');
  }

  // Check if order can be cancelled
  if (!order.canBeCancelled) {
    res.status(400);
    throw new Error('This order cannot be cancelled');
  }

  try {
    await order.updateStatus('cancelled', reason);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }

  // TODO: If paid with eSewa, initiate refund

  res.status(200).json({
    success: true,
    message: 'Order cancelled successfully',
    data: order,
  });
});

// @desc    Get all orders (Admin)
// @route   GET /api/orders/all
// @access  Private/Admin
const getAllOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationOptions(req.query);
  const { status, paymentStatus, sort } = req.query;

  const filter = {};

  if (status) filter.orderStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;

  const allowedSortFields = {
    createdAt: true,
    total: true,
    orderStatus: true,
  };

  const sortOptions = getSortOptions(sort, allowedSortFields);

  const [orders, totalItems] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Order.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(totalItems, page, limit);

  res.status(200).json({
    success: true,
    message: 'Orders fetched successfully',
    data: orders,
    pagination,
  });
});

// @desc    Get order statistics (Admin)
// @route   GET /api/orders/stats
// @access  Private/Admin
const getOrderStats = asyncHandler(async (req, res) => {
  const stats = await Order.aggregate([
    {
      $facet: {
        byStatus: [{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }],
        byPaymentStatus: [{ $group: { _id: '$paymentStatus', count: { $sum: 1 } } }],
        byPaymentMethod: [{ $group: { _id: '$paymentMethod', count: { $sum: 1 } } }],
        totals: [
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalRevenue: {
                $sum: {
                  $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0],
                },
              },
              averageOrderValue: { $avg: '$total' },
            },
          },
        ],
        recentOrders: [{ $sort: { createdAt: -1 } }, { $limit: 5 }, { $project: { orderNumber: 1, total: 1, orderStatus: 1, createdAt: 1 } }],
      },
    },
  ]);

  res.status(200).json({
    success: true,
    message: 'Order statistics fetched successfully',
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
  getAllOrders,
  getOrderStats,
};

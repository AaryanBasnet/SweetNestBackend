/**
 * Order Controller
 * CRUD operations for orders
 */

const asyncHandler = require("express-async-handler");
const Order = require("../model/Order");
const Cart = require("../model/Cart");
const {
  getPaginationOptions,
  buildPaginationMeta,
  getSortOptions,
} = require("../utils/pagination");
const { awardPoints } = require("./rewardsController");

// @desc    Create new order from cart
// @route   POST /api/orders
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Get user's cart with populated cake data
  const cart = await Cart.findOne({ user: userId }).populate({
    path: "items.cake",
    select: "name images slug",
  });

  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error("Your cart is empty");
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
  const orderItems = cart.items.map((item) => {
    // Check if this is a custom cake (stored locally, not in database)
    const isCustomCake = !item.cake || !item.cake._id;

    if (isCustomCake) {
      // Handle custom cake order item
      return {
        cake: null, // No database reference
        name: item.customization?.name || `Custom ${item.customization?.flavor} Cake`,
        image: item.customization?.previewImage || "",
        quantity: item.quantity,
        weight: {
          weightInKg: item.selectedWeight.weightInKg,
          label: item.selectedWeight.label || `${item.selectedWeight.weightInKg}kg`,
          price: item.selectedWeight.price,
        },
        isCustom: true,
        customizations: [
          {
            name: "Custom Cake Design",
            details: {
              tiers: item.customization?.tiers,
              size: item.customization?.size,
              flavor: item.customization?.flavor,
              frostingColor: item.customization?.color,
              frostingColorHex: item.customization?.frostingColorHex,
              topper: item.customization?.topper,
              topperPrice: item.customization?.topperPrice || 0,
              message: item.customization?.message || "",
            },
            priceAdjustment: item.customization?.topperPrice || 0,
          },
        ],
        itemTotal: item.selectedWeight.price * item.quantity,
      };
    }

    // Handle regular cake order item
    return {
      cake: item.cake._id,
      name: item.cake.name,
      image: item.cake.images?.[0]?.url || "",
      quantity: item.quantity,
      weight: {
        weightInKg: item.selectedWeight.weightInKg,
        label: item.selectedWeight.label,
        price: item.selectedWeight.price,
      },
      isCustom: false,
      customizations: item.customization
        ? [
            {
              name: "Custom Message",
              selectedOption: item.customization.message || "",
              priceAdjustment: 0,
            },
          ]
        : [],
      itemTotal: item.selectedWeight.price * item.quantity,
    };
  });

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
    paymentStatus: paymentMethod === "cod" ? "pending" : "pending",
    orderStatus: paymentMethod === "cod" ? "confirmed" : "pending",
    subtotal,
    shipping,
    discount,
    total,
    promoCode: cart.promoCode || null,
  });

  // Clear the cart after successful order creation
  // If it is 'esewa', we wait until payment success in esewaController
  if (paymentMethod === "cod") {
    await Cart.findOneAndUpdate(
      { user: userId },
      { items: [], promoCode: null }
    );
  }

  // Populate for response
  await order.populate("user", "name email");

  res.status(201).json({
    success: true,
    message: "Order created successfully",
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
      console.log(`Awarded points for order ${order.orderNumber}`);
    } catch (error) {
      console.error("Error awarding points:", error);
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

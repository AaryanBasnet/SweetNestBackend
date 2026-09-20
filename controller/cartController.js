/**
 * Cart Controller
 *
 * HTTP adapters only. Each handler takes the request apart, calls a service,
 * and shapes the reply. Every rule about what a cart line costs, what may be
 * added, and which discount codes apply lives in services/.
 *
 * Validation of request shape is handled by Zod middleware in the routes.
 */

const asyncHandler = require('express-async-handler');

const cartService = require('../services/cartService');
const discountService = require('../services/discountService');
const Cart = require('../model/Cart');
const { notFound } = require('../utils/AppError');

// @desc    Get user's cart
// @route   GET /api/cart
// @access  Private
const getCart = asyncHandler(async (req, res) => {
  const data = await cartService.getCart(req.user._id);

  res.status(200).json({
    success: true,
    message: 'Cart fetched successfully',
    data,
  });
});

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
const addToCart = asyncHandler(async (req, res) => {
  const data = await cartService.addItem(req.user._id, req.body);

  res.status(201).json({
    success: true,
    message: 'Added to cart',
    data,
  });
});

// @desc    Update cart item quantity
// @route   PUT /api/cart/:itemId
// @access  Private
const updateCartItem = asyncHandler(async (req, res) => {
  const data = await cartService.updateItemQuantity(
    req.user._id,
    req.params.itemId,
    req.body.quantity
  );

  res.status(200).json({
    success: true,
    message: 'Cart updated',
    data,
  });
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:itemId
// @access  Private
const removeFromCart = asyncHandler(async (req, res) => {
  const data = await cartService.removeItem(req.user._id, req.params.itemId);

  res.status(200).json({
    success: true,
    message: 'Item removed from cart',
    data,
  });
});

// @desc    Merge a guest cart into the account's cart
// @route   POST /api/cart/sync
// @access  Private
const syncCart = asyncHandler(async (req, res) => {
  const data = await cartService.syncCart(req.user._id, req.body.items);

  res.status(200).json({
    success: true,
    message: 'Cart synced successfully',
    data,
  });
});

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
const clearCart = asyncHandler(async (req, res) => {
  const data = await cartService.clearCart(req.user._id);

  res.status(200).json({
    success: true,
    message: 'Cart cleared',
    data,
  });
});

// @desc    Set delivery or pickup
// @route   PUT /api/cart/delivery
// @access  Private
const updateDeliveryType = asyncHandler(async (req, res) => {
  const data = await cartService.setDeliveryType(
    req.user._id,
    req.body.deliveryType
  );

  res.status(200).json({
    success: true,
    message: 'Delivery type updated',
    data,
  });
});

// @desc    Apply a promo code or an earned coupon
// @route   POST /api/cart/promo
// @access  Private
const applyPromoCode = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    throw notFound('Cart not found');
  }

  // Which codes exist, who may use them, whether they have expired and what
  // the order must be worth are all decided in one service.
  const discount = await discountService.resolveDiscountCode({
    code: req.body.code,
    userId: req.user._id,
    subtotal: cart.subtotal,
  });

  cart.promoCode = {
    code: discount.code,
    discount: discount.discount,
    discountType: discount.discountType,
    maxDiscount: discount.maxDiscount,
    couponId: discount.couponId,
  };

  await cart.save();

  res.status(200).json({
    success: true,
    message: discount.isCoupon
      ? 'Coupon applied successfully'
      : 'Promo code applied',
    data: {
      promoCode: cart.promoCode.code,
      discountAmount: cart.discountAmount,
      total: cart.total,
      isCoupon: discount.isCoupon,
    },
  });
});

// @desc    Remove the applied promo code
// @route   DELETE /api/cart/promo
// @access  Private
const removePromoCode = asyncHandler(async (req, res) => {
  const data = await cartService.removePromoCode(req.user._id);

  res.status(200).json({
    success: true,
    message: 'Promo code removed',
    data,
  });
});

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  syncCart,
  clearCart,
  updateDeliveryType,
  applyPromoCode,
  removePromoCode,
};

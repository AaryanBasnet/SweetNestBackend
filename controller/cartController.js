/**
 * Cart Controller
 * CRUD operations for user shopping carts
 */

const asyncHandler = require('express-async-handler');
const Cart = require('../model/Cart');
const Cake = require('../model/Cake');

// @desc    Get user's cart
// @route   GET /api/cart
// @access  Private
const getCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ user: req.user._id }).populate({
    path: 'items.cake',
    select: 'name slug images weightOptions basePrice isActive category',
    populate: {
      path: 'category',
      select: 'name slug',
    },
  });

  // Create empty cart if doesn't exist
  if (!cart) {
    cart = await Cart.create({ user: req.user._id, items: [] });
  }

  // Filter out inactive cakes and recalculate
  const activeItems = cart.items.filter((item) => item.cake && item.cake.isActive);

  // If items were removed, update cart
  if (activeItems.length !== cart.items.length) {
    cart.items = activeItems;
    await cart.save();
  }

  res.status(200).json({
    success: true,
    message: 'Cart fetched successfully',
    data: {
      items: activeItems,
      itemCount: cart.itemCount,
      subtotal: cart.subtotal,
      shipping: cart.shipping,
      discountAmount: cart.discountAmount,
      total: cart.total,
      deliveryType: cart.deliveryType,
      promoCode: cart.promoCode?.code || null,
    },
  });
});

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
const addToCart = asyncHandler(async (req, res) => {
  const { cakeId, quantity = 1, selectedWeight, customization } = req.body;

  // Verify cake exists and is active
  const cake = await Cake.findOne({ _id: cakeId, isActive: true });
  if (!cake) {
    res.status(404);
    throw new Error('Cake not found or unavailable');
  }

  // Verify weight option exists
  const weightOption = cake.weightOptions.find(
    (opt) => opt.weightInKg === selectedWeight.weightInKg
  );
  if (!weightOption) {
    res.status(400);
    throw new Error('Invalid weight option');
  }

  let cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    cart = await Cart.create({
      user: req.user._id,
      items: [
        {
          cake: cakeId,
          quantity,
          selectedWeight: {
            weightInKg: weightOption.weightInKg,
            label: weightOption.label,
            price: weightOption.price,
          },
          customization,
        },
      ],
    });
  } else {
    // Check if same cake with same weight already in cart
    const existingIndex = cart.items.findIndex(
      (item) =>
        item.cake.toString() === cakeId &&
        item.selectedWeight.weightInKg === selectedWeight.weightInKg
    );

    if (existingIndex > -1) {
      // Update quantity
      const newQty = cart.items[existingIndex].quantity + quantity;
      if (newQty > 10) {
        res.status(400);
        throw new Error('Maximum quantity is 10');
      }
      cart.items[existingIndex].quantity = newQty;
    } else {
      // Add new item
      cart.items.push({
        cake: cakeId,
        quantity,
        selectedWeight: {
          weightInKg: weightOption.weightInKg,
          label: weightOption.label,
          price: weightOption.price,
        },
        customization,
      });
    }

    await cart.save();
  }

  // Populate and return
  await cart.populate({
    path: 'items.cake',
    select: 'name slug images weightOptions basePrice isActive',
  });

  res.status(201).json({
    success: true,
    message: 'Added to cart',
    data: {
      items: cart.items,
      itemCount: cart.itemCount,
      subtotal: cart.subtotal,
      shipping: cart.shipping,
      total: cart.total,
    },
  });
});

// @desc    Update cart item quantity
// @route   PUT /api/cart/:itemId
// @access  Private
const updateCartItem = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const { quantity } = req.body;

  if (quantity < 1 || quantity > 10) {
    res.status(400);
    throw new Error('Quantity must be between 1 and 10');
  }

  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  const item = cart.items.id(itemId);

  if (!item) {
    res.status(404);
    throw new Error('Item not in cart');
  }

  item.quantity = quantity;
  await cart.save();

  // Populate and return
  await cart.populate({
    path: 'items.cake',
    select: 'name slug images weightOptions basePrice isActive',
  });

  res.status(200).json({
    success: true,
    message: 'Cart updated',
    data: {
      items: cart.items,
      itemCount: cart.itemCount,
      subtotal: cart.subtotal,
      shipping: cart.shipping,
      total: cart.total,
    },
  });
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:itemId
// @access  Private
const removeFromCart = asyncHandler(async (req, res) => {
  const { itemId } = req.params;

  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  const itemIndex = cart.items.findIndex((item) => item._id.toString() === itemId);

  if (itemIndex === -1) {
    res.status(404);
    throw new Error('Item not in cart');
  }

  cart.items.splice(itemIndex, 1);
  await cart.save();

  res.status(200).json({
    success: true,
    message: 'Removed from cart',
    data: {
      itemCount: cart.itemCount,
      subtotal: cart.subtotal,
      shipping: cart.shipping,
      total: cart.total,
    },
  });
});

// @desc    Sync cart (merge localStorage with server)
// @route   POST /api/cart/sync
// @access  Private
const syncCart = asyncHandler(async (req, res) => {
  const { items } = req.body; // Array of cart items from localStorage

  if (!Array.isArray(items)) {
    res.status(400);
    throw new Error('Items must be an array');
  }

  let cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    cart = await Cart.create({ user: req.user._id, items: [] });
  }

  // Process each item from localStorage
  for (const localItem of items) {
    const { cakeId, quantity, selectedWeight } = localItem;

    // Verify cake exists and is active
    const cake = await Cake.findOne({ _id: cakeId, isActive: true });
    if (!cake) continue;

    // Verify weight option
    const weightOption = cake.weightOptions.find(
      (opt) => opt.weightInKg === selectedWeight?.weightInKg
    );
    if (!weightOption) continue;

    // Check if already in cart
    const existingIndex = cart.items.findIndex(
      (item) =>
        item.cake.toString() === cakeId &&
        item.selectedWeight.weightInKg === selectedWeight.weightInKg
    );

    if (existingIndex > -1) {
      // Update quantity (max 10)
      cart.items[existingIndex].quantity = Math.min(
        10,
        cart.items[existingIndex].quantity + (quantity || 1)
      );
    } else {
      // Add new item
      cart.items.push({
        cake: cakeId,
        quantity: Math.min(10, quantity || 1),
        selectedWeight: {
          weightInKg: weightOption.weightInKg,
          label: weightOption.label,
          price: weightOption.price,
        },
      });
    }
  }

  await cart.save();

  // Populate and return
  await cart.populate({
    path: 'items.cake',
    select: 'name slug images weightOptions basePrice isActive',
  });

  res.status(200).json({
    success: true,
    message: 'Cart synced successfully',
    data: {
      items: cart.items,
      itemCount: cart.itemCount,
      subtotal: cart.subtotal,
      shipping: cart.shipping,
      total: cart.total,
    },
  });
});

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
const clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });

  if (cart) {
    cart.items = [];
    cart.promoCode = undefined;
    await cart.save();
  }

  res.status(200).json({
    success: true,
    message: 'Cart cleared',
    data: {
      items: [],
      itemCount: 0,
      subtotal: 0,
      shipping: 0,
      total: 0,
    },
  });
});

// @desc    Update delivery type
// @route   PUT /api/cart/delivery
// @access  Private
const updateDeliveryType = asyncHandler(async (req, res) => {
  const { deliveryType } = req.body;

  if (!['delivery', 'pickup'].includes(deliveryType)) {
    res.status(400);
    throw new Error('Invalid delivery type');
  }

  let cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    cart = await Cart.create({ user: req.user._id, items: [], deliveryType });
  } else {
    cart.deliveryType = deliveryType;
    await cart.save();
  }

  res.status(200).json({
    success: true,
    message: 'Delivery type updated',
    data: {
      deliveryType: cart.deliveryType,
      shipping: cart.shipping,
      total: cart.total,
    },
  });
});

// @desc    Apply promo code
// @route   POST /api/cart/promo
// @access  Private
const applyPromoCode = asyncHandler(async (req, res) => {
  const { code } = req.body;

  // TODO: Implement promo code validation from PromoCode model
  // For now, simple example codes
  const promoCodes = {
    SWEET10: { discount: 10, discountType: 'percentage' },
    FLAT50: { discount: 50, discountType: 'fixed' },
  };

  const promo = promoCodes[code?.toUpperCase()];

  if (!promo) {
    res.status(400);
    throw new Error('Invalid promo code');
  }

  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  cart.promoCode = {
    code: code.toUpperCase(),
    discount: promo.discount,
    discountType: promo.discountType,
  };

  await cart.save();

  res.status(200).json({
    success: true,
    message: 'Promo code applied',
    data: {
      promoCode: cart.promoCode.code,
      discountAmount: cart.discountAmount,
      total: cart.total,
    },
  });
});

// @desc    Remove promo code
// @route   DELETE /api/cart/promo
// @access  Private
const removePromoCode = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  cart.promoCode = undefined;
  await cart.save();

  res.status(200).json({
    success: true,
    message: 'Promo code removed',
    data: {
      total: cart.total,
    },
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

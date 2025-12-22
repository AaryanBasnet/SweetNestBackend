/**
 * Cart Routes
 * API endpoints for shopping cart management
 */

const express = require('express');
const router = express.Router();

const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  syncCart,
  clearCart,
  updateDeliveryType,
  applyPromoCode,
  removePromoCode,
} = require('../controller/cartController');

const { protect } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Main routes
router.route('/')
  .get(getCart)
  .post(addToCart)
  .delete(clearCart);

// Sync route (merge localStorage with server)
router.post('/sync', syncCart);

// Delivery type
router.put('/delivery', updateDeliveryType);

// Promo code
router.route('/promo')
  .post(applyPromoCode)
  .delete(removePromoCode);

// Item-specific routes
router.route('/:itemId')
  .put(updateCartItem)
  .delete(removeFromCart);

module.exports = router;

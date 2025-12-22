/**
 * Wishlist Routes
 * API endpoints for wishlist management
 */

const express = require('express');
const router = express.Router();

const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  syncWishlist,
  clearWishlist,
  setReminder,
} = require('../controller/wishlistController');

const { protect } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Main routes
router.route('/')
  .get(getWishlist)
  .post(addToWishlist)
  .delete(clearWishlist);

// Sync route (merge localStorage with server)
router.post('/sync', syncWishlist);

// Item-specific routes
router.delete('/:cakeId', removeFromWishlist);
router.put('/:cakeId/reminder', setReminder);

module.exports = router;

/**
 * Promotion Routes
 * API endpoints for seasonal promotions
 */

const express = require('express');
const router = express.Router();

const {
  getActivePromotions,
  getAllPromotions,
  getPromotionById,
  createPromotion,
  updatePromotion,
  deletePromotion,
} = require('../controller/promotionController');

const { protect, admin } = require('../middleware/authMiddleware');
const { uploadCakeImages, handleUploadError } = require('../middleware/uploadMiddleware');
const { parseJsonBody } = require('../middleware/parseJsonMiddleware');

// --- PUBLIC ROUTES ---
router.get('/active', getActivePromotions);

// --- ADMIN ROUTES ---
router.get('/', protect, admin, getAllPromotions);
router.get('/:id', protect, admin, getPromotionById);

router.post(
  '/',
  protect,
  admin,
  uploadCakeImages.array('images', 5),
  handleUploadError,
  parseJsonBody,
  createPromotion
);

router.put(
  '/:id',
  protect,
  admin,
  uploadCakeImages.array('images', 5),
  handleUploadError,
  parseJsonBody,
  updatePromotion
);

router.delete('/:id', protect, admin, deletePromotion);

module.exports = router;

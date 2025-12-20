/**
 * Cake Routes
 * API endpoints for cakes
 */

const express = require('express');
const router = express.Router();

const {
  getCakes,
  getCakeBySlug,
  getCakeById,
  createCake,
  updateCake,
  deleteCake,
  getFeaturedCakes,
  getCakesByCategory,
} = require('../controller/cakeController');

const { getCakeReviews, createReview } = require('../controller/reviewController');

const { protect, admin } = require('../middleware/authMiddleware');
const { uploadCakeImages, handleUploadError } = require('../middleware/uploadMiddleware');
const { validate } = require('../middleware/validateMiddleware');
const {
  createCakeSchema,
  updateCakeSchema,
  getCakeBySlugSchema,
  getCakeByIdSchema,
  deleteCakeSchema,
  getCakesByCategorySchema,
} = require('../validators/cakeValidators');
const { getCakeReviewsSchema, createReviewSchema } = require('../validators/reviewValidators');

// Public routes
router.get('/', getCakes);
router.get('/featured', getFeaturedCakes);
router.get('/category/:categorySlug', validate(getCakesByCategorySchema), getCakesByCategory);
router.get('/id/:id', validate(getCakeByIdSchema), getCakeById);
router.get('/:slug', validate(getCakeBySlugSchema), getCakeBySlug);

// Review routes (nested under cakes)
router.get('/:cakeId/reviews', validate(getCakeReviewsSchema), getCakeReviews);
router.post('/:cakeId/reviews', protect, validate(createReviewSchema), createReview);

// Admin routes
router.post(
  '/',
  protect,
  admin,
  uploadCakeImages.array('images', 5),
  handleUploadError,
  validate(createCakeSchema),
  createCake
);

router.put(
  '/:id',
  protect,
  admin,
  uploadCakeImages.array('images', 5),
  handleUploadError,
  validate(updateCakeSchema),
  updateCake
);

router.delete('/:id', protect, admin, validate(deleteCakeSchema), deleteCake);

module.exports = router;

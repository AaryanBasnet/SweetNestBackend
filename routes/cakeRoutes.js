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

// 1. IMPORT MIDDLEWARE
const { validate, validateBody, validateParams } = require('../middleware/validateMiddleware');
const { parseJsonBody } = require('../middleware/parseJsonMiddleware'); 

// 2. IMPORT SCHEMAS
const {
  createCakeSchema,
  updateCakeBodySchema, // New schema
  cakeIdParamSchema,    // New schema
  getCakeBySlugSchema,
  getCakeByIdSchema,
  deleteCakeSchema,
  getCakesByCategorySchema,
} = require('../validators/cakeValidators');
const { getCakeReviewsSchema, createReviewSchema } = require('../validators/reviewValidators');

// --- PUBLIC ROUTES ---
router.get('/', getCakes);
router.get('/featured', getFeaturedCakes);
router.get('/category/:categorySlug', validate(getCakesByCategorySchema), getCakesByCategory);
router.get('/id/:id', validate(getCakeByIdSchema), getCakeById);
router.get('/:slug', validate(getCakeBySlugSchema), getCakeBySlug);

// Review routes
router.get('/:cakeId/reviews', validate(getCakeReviewsSchema), getCakeReviews);
router.post('/:cakeId/reviews', protect, validate(createReviewSchema), createReview);

// --- ADMIN ROUTES ---

// Create Cake
router.post(
  '/',
  protect,
  admin,
  uploadCakeImages.array('images', 5), // 1. Handle Files & Form Strings
  handleUploadError,
  parseJsonBody,                       // 2. Convert Strings -> Objects
  validateBody(createCakeSchema),      // 3. Validate Body Fields
  createCake                           // 4. Controller
);

// Update Cake
router.put(
  '/:id',
  protect,
  admin,
  uploadCakeImages.array('images', 5),
  handleUploadError,
  parseJsonBody,
  validateParams(cakeIdParamSchema),    // 3a. Validate ID from URL
  validateBody(updateCakeBodySchema),   // 3b. Validate Body Fields
  updateCake
);

// Delete Cake
router.delete(
    '/:id', 
    protect, 
    admin, 
    validate(deleteCakeSchema), // Uses wrapped schema { params: { id } }
    deleteCake
);

module.exports = router;
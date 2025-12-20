/**
 * Review Routes
 * API endpoints for reviews (standalone routes, not nested)
 */

const express = require('express');
const router = express.Router();

const {
  updateReview,
  deleteReview,
  getMyReviews,
  markReviewHelpful,
  getAllReviews,
  approveReview,
} = require('../controller/reviewController');

const { protect, admin } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');
const {
  updateReviewSchema,
  deleteReviewSchema,
  markHelpfulSchema,
  approveReviewSchema,
  getAllReviewsQuerySchema,
} = require('../validators/reviewValidators');

// Public routes
router.post('/:id/helpful', validate(markHelpfulSchema), markReviewHelpful);

// Private routes (authenticated users)
router.get('/my-reviews', protect, getMyReviews);
router.put('/:id', protect, validate(updateReviewSchema), updateReview);
router.delete('/:id', protect, validate(deleteReviewSchema), deleteReview);

// Admin routes
router.get('/admin/all', protect, admin, validate(getAllReviewsQuerySchema), getAllReviews);
router.put('/admin/:id/approve', protect, admin, validate(approveReviewSchema), approveReview);

module.exports = router;

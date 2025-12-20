/**
 * Review Controller
 * CRUD operations for cake reviews
 * Validation is handled by Zod middleware in routes
 */

const asyncHandler = require('express-async-handler');
const Review = require('../model/Review');
const Cake = require('../model/Cake');
const { getPaginationOptions, buildPaginationMeta } = require('../utils/pagination');

// @desc    Get reviews for a cake
// @route   GET /api/cakes/:cakeId/reviews
// @access  Public
const getCakeReviews = asyncHandler(async (req, res) => {
  const { cakeId } = req.params;
  const { page, limit, skip } = getPaginationOptions(req.query);

  const cake = await Cake.findById(cakeId);
  if (!cake) {
    res.status(404);
    throw new Error('Cake not found');
  }

  const filter = { cake: cakeId, isApproved: true };

  const [reviews, totalItems] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Review.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(totalItems, page, limit);

  res.status(200).json({
    success: true,
    message: 'Reviews fetched successfully',
    data: reviews,
    pagination,
    summary: {
      averageRating: cake.ratingsAverage,
      totalReviews: cake.ratingsCount,
    },
  });
});

// @desc    Create a review
// @route   POST /api/cakes/:cakeId/reviews
// @access  Private
const createReview = asyncHandler(async (req, res) => {
  const { cakeId } = req.params;
  const { rating, comment } = req.body;

  const cake = await Cake.findById(cakeId);
  if (!cake) {
    res.status(404);
    throw new Error('Cake not found');
  }

  // Check if user already reviewed this cake
  const existingReview = await Review.findOne({
    cake: cakeId,
    user: req.user._id,
  });

  if (existingReview) {
    res.status(400);
    throw new Error('You have already reviewed this cake');
  }

  const review = await Review.create({
    cake: cakeId,
    user: req.user._id,
    rating: Number(rating),
    comment,
    reviewerName: req.user.name,
    isVerifiedPurchase: false,
    isApproved: true,
  });

  res.status(201).json({
    success: true,
    message: 'Review submitted successfully',
    data: review,
  });
});

// @desc    Update a review
// @route   PUT /api/reviews/:id
// @access  Private
const updateReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;

  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Check ownership
  if (review.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to update this review');
  }

  if (rating !== undefined) review.rating = Number(rating);
  if (comment !== undefined) review.comment = comment;

  const updatedReview = await review.save();

  res.status(200).json({
    success: true,
    message: 'Review updated successfully',
    data: updatedReview,
  });
});

// @desc    Delete a review
// @route   DELETE /api/reviews/:id
// @access  Private
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  const isOwner = review.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this review');
  }

  await Review.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Review deleted successfully',
  });
});

// @desc    Get user's reviews
// @route   GET /api/reviews/my-reviews
// @access  Private
const getMyReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationOptions(req.query);

  const filter = { user: req.user._id };

  const [reviews, totalItems] = await Promise.all([
    Review.find(filter)
      .populate('cake', 'name slug images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Review.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(totalItems, page, limit);

  res.status(200).json({
    success: true,
    message: 'Your reviews fetched successfully',
    data: reviews,
    pagination,
  });
});

// @desc    Mark review as helpful
// @route   POST /api/reviews/:id/helpful
// @access  Public
const markReviewHelpful = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  review.helpfulCount += 1;
  await review.save();

  res.status(200).json({
    success: true,
    message: 'Review marked as helpful',
    data: { helpfulCount: review.helpfulCount },
  });
});

// ============ ADMIN ROUTES ============

// @desc    Get all reviews (admin)
// @route   GET /api/reviews/admin/all
// @access  Private/Admin
const getAllReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationOptions(req.query);
  const { approved, cakeId } = req.query;

  const filter = {};
  if (approved === 'true') filter.isApproved = true;
  if (approved === 'false') filter.isApproved = false;
  if (cakeId) filter.cake = cakeId;

  const [reviews, totalItems] = await Promise.all([
    Review.find(filter)
      .populate('cake', 'name slug')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Review.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(totalItems, page, limit);

  res.status(200).json({
    success: true,
    message: 'Reviews fetched successfully',
    data: reviews,
    pagination,
  });
});

// @desc    Approve/Reject review (admin)
// @route   PUT /api/reviews/admin/:id/approve
// @access  Private/Admin
const approveReview = asyncHandler(async (req, res) => {
  const { isApproved } = req.body;

  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  review.isApproved = isApproved;
  await review.save();

  res.status(200).json({
    success: true,
    message: isApproved ? 'Review approved' : 'Review rejected',
    data: review,
  });
});

module.exports = {
  getCakeReviews,
  createReview,
  updateReview,
  deleteReview,
  getMyReviews,
  markReviewHelpful,
  getAllReviews,
  approveReview,
};

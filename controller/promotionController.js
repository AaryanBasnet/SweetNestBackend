/**
 * Promotion Controller
 * CRUD operations for seasonal promotions
 */

const asyncHandler = require('express-async-handler');
const Promotion = require('../model/Promotion');
const { deleteMultipleImages } = require('../config/cloudinary');
const { processAndUploadFiles } = require('../middleware/uploadMiddleware');

// @desc    Get active promotions (for public display)
// @route   GET /api/promotions/active
// @access  Public
const getActivePromotions = asyncHandler(async (req, res) => {
  const now = new Date();

  const promotions = await Promotion.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .sort({ priority: -1, createdAt: -1 })
    .populate('linkedCakes', 'name slug images')
    .populate('linkedCategory', 'name slug')
    .lean();

  res.status(200).json({
    success: true,
    count: promotions.length,
    data: promotions,
  });
});

// @desc    Get all promotions (admin)
// @route   GET /api/promotions
// @access  Private/Admin
const getAllPromotions = asyncHandler(async (req, res) => {
  const { active, season } = req.query;

  const filter = {};
  if (active === 'true') filter.isActive = true;
  if (active === 'false') filter.isActive = false;
  if (season) filter.seasonTag = season;

  const promotions = await Promotion.find(filter)
    .sort({ priority: -1, createdAt: -1 })
    .populate('linkedCakes', 'name slug')
    .populate('linkedCategory', 'name slug');

  res.status(200).json({
    success: true,
    count: promotions.length,
    data: promotions,
  });
});

// @desc    Get single promotion by ID
// @route   GET /api/promotions/:id
// @access  Private/Admin
const getPromotionById = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findById(req.params.id)
    .populate('linkedCakes', 'name slug images')
    .populate('linkedCategory', 'name slug');

  if (!promotion) {
    res.status(404);
    throw new Error('Promotion not found');
  }

  res.status(200).json({
    success: true,
    data: promotion,
  });
});

// @desc    Create new promotion
// @route   POST /api/promotions
// @access  Private/Admin
const createPromotion = asyncHandler(async (req, res) => {
  let { title, description, startDate, endDate, seasonTag, linkedCakes, linkedCategory, ctaText, ctaLink, priority, isActive } = req.body;

  // Parse linkedCakes if it's a JSON string
  if (linkedCakes && typeof linkedCakes === 'string') {
    try {
      linkedCakes = JSON.parse(linkedCakes);
    } catch (e) {
      linkedCakes = [];
    }
  }

  // Process uploaded images
  let uploadedImages = [];
  if (req.files && req.files.length > 0) {
    uploadedImages = await processAndUploadFiles(req.files, 'promotions');
  } else {
    res.status(400);
    throw new Error('At least one image is required');
  }

  const promotion = await Promotion.create({
    title,
    description,
    images: uploadedImages,
    startDate,
    endDate,
    seasonTag,
    linkedCakes: linkedCakes || [],
    linkedCategory: linkedCategory || null,
    ctaText: ctaText || 'VIEW DETAILS',
    ctaLink: ctaLink || '/shop',
    priority: priority || 0,
    isActive: isActive !== undefined ? isActive : true,
  });

  const populatedPromotion = await Promotion.findById(promotion._id)
    .populate('linkedCakes', 'name slug')
    .populate('linkedCategory', 'name slug');

  res.status(201).json({
    success: true,
    data: populatedPromotion,
  });
});

// @desc    Update promotion
// @route   PUT /api/promotions/:id
// @access  Private/Admin
const updatePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findById(req.params.id);

  if (!promotion) {
    res.status(404);
    throw new Error('Promotion not found');
  }

  const { title, description, startDate, endDate, seasonTag, linkedCakes, linkedCategory, ctaText, ctaLink, priority, isActive, removeImages } = req.body;

  // Handle image updates
  let updatedImages = [...promotion.images];

  // Remove specified images
  if (removeImages && removeImages.length > 0) {
    const imagesToDelete = promotion.images.filter(img =>
      removeImages.includes(img.public_id)
    );

    if (imagesToDelete.length > 0) {
      await deleteMultipleImages(imagesToDelete.map(img => img.public_id));
      updatedImages = updatedImages.filter(img =>
        !removeImages.includes(img.public_id)
      );
    }
  }

  // Add new images
  if (req.files && req.files.length > 0) {
    const newImages = await processAndUploadFiles(req.files, 'promotions');
    updatedImages = [...updatedImages, ...newImages];
  }

  // Ensure at least one image remains
  if (updatedImages.length === 0) {
    res.status(400);
    throw new Error('At least one image is required');
  }

  // Update fields
  promotion.title = title || promotion.title;
  promotion.description = description || promotion.description;
  promotion.images = updatedImages;
  promotion.startDate = startDate || promotion.startDate;
  promotion.endDate = endDate || promotion.endDate;
  promotion.seasonTag = seasonTag || promotion.seasonTag;
  promotion.linkedCakes = linkedCakes !== undefined ? linkedCakes : promotion.linkedCakes;
  promotion.linkedCategory = linkedCategory !== undefined ? linkedCategory : promotion.linkedCategory;
  promotion.ctaText = ctaText || promotion.ctaText;
  promotion.ctaLink = ctaLink || promotion.ctaLink;
  promotion.priority = priority !== undefined ? priority : promotion.priority;
  promotion.isActive = isActive !== undefined ? isActive : promotion.isActive;

  const updatedPromotion = await promotion.save();

  const populatedPromotion = await Promotion.findById(updatedPromotion._id)
    .populate('linkedCakes', 'name slug')
    .populate('linkedCategory', 'name slug');

  res.status(200).json({
    success: true,
    data: populatedPromotion,
  });
});

// @desc    Delete promotion
// @route   DELETE /api/promotions/:id
// @access  Private/Admin
const deletePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findById(req.params.id);

  if (!promotion) {
    res.status(404);
    throw new Error('Promotion not found');
  }

  // Delete all images from Cloudinary
  if (promotion.images && promotion.images.length > 0) {
    await deleteMultipleImages(promotion.images.map(img => img.public_id));
  }

  await promotion.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Promotion deleted successfully',
  });
});

module.exports = {
  getActivePromotions,
  getAllPromotions,
  getPromotionById,
  createPromotion,
  updatePromotion,
  deletePromotion,
};

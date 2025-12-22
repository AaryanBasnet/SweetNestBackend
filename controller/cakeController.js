/**
 * Cake Controller
 * CRUD operations for cakes (made-to-order service)
 * Validation is handled by Zod middleware in routes
 */

const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Cake = require('../model/Cake');
const { deleteImage, deleteMultipleImages } = require('../config/cloudinary');
const { processAndUploadFiles } = require('../middleware/uploadMiddleware');
const { getPaginationOptions, buildPaginationMeta, getSortOptions } = require('../utils/pagination');
const { getFlavorTags } = require('../utils/flavorDetector');

// @desc    Get all cakes with filtering, sorting, pagination
// @route   GET /api/cakes
// @access  Public
const getCakes = asyncHandler(async (req, res) => {
  const { category, badge, flavorTags, minPrice, maxPrice, search, featured, active, sort } = req.query;
  const { page, limit, skip } = getPaginationOptions(req.query);

  // Build filter object
  const filter = {};

  if (active === 'all') {
    // Don't filter by isActive
  } else if (active === 'false') {
    filter.isActive = false;
  } else {
    filter.isActive = true;
  }

  // Handle category - can be ObjectId or slug
  if (category) {
    if (mongoose.Types.ObjectId.isValid(category)) {
      filter.category = category;
    } else {
      // It's a slug, look up the category first
      const Category = require('../model/Category');
      const categoryDoc = await Category.findOne({ slug: category });
      if (categoryDoc) {
        filter.category = categoryDoc._id;
      }
    }
  }
  if (badge) filter.badges = badge;
  if (featured === 'true') filter.isFeatured = true;

  // Filter by flavor tags (supports comma-separated values)
  if (flavorTags) {
    const tagsArray = flavorTags.split(',').map(tag => tag.trim());
    filter.flavorTags = { $in: tagsArray };
  }

  if (minPrice || maxPrice) {
    filter['weightOptions.price'] = {};
    if (minPrice) filter['weightOptions.price'].$gte = Number(minPrice);
    if (maxPrice) filter['weightOptions.price'].$lte = Number(maxPrice);
  }

  if (search) filter.$text = { $search: search };

  const allowedSortFields = {
    createdAt: true,
    'weightOptions.price': true,
    ratingsAverage: true,
    ratingsCount: true,
    name: true,
  };

  let sortParam = sort;
  if (sort === 'basePrice' || sort === '-basePrice') {
    sortParam = sort.replace('basePrice', 'weightOptions.0.price');
  }

  const sortOptions = getSortOptions(sortParam, allowedSortFields);

  const [cakes, totalItems] = await Promise.all([
    Cake.find(filter)
      .populate('category', 'name slug')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Cake.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(totalItems, page, limit);

  res.status(200).json({
    success: true,
    message: 'Cakes fetched successfully',
    data: cakes,
    pagination,
  });
});

// @desc    Get single cake by slug
// @route   GET /api/cakes/:slug
// @access  Public
const getCakeBySlug = asyncHandler(async (req, res) => {
  const cake = await Cake.findOne({ slug: req.params.slug })
    .populate('category', 'name slug')
    .select('-__v');

  if (!cake) {
    res.status(404);
    throw new Error('Cake not found');
  }

  res.status(200).json({
    success: true,
    message: 'Cake fetched successfully',
    data: cake,
  });
});

// @desc    Get cake by ID
// @route   GET /api/cakes/id/:id
// @access  Public
const getCakeById = asyncHandler(async (req, res) => {
  const cake = await Cake.findById(req.params.id)
    .populate('category', 'name slug')
    .select('-__v');

  if (!cake) {
    res.status(404);
    throw new Error('Cake not found');
  }

  res.status(200).json({
    success: true,
    message: 'Cake fetched successfully',
    data: cake,
  });
});

// @desc    Create new cake
// @route   POST /api/cakes
// @access  Private/Admin
const createCake = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    category,
    weightOptions,
    ingredients,
    storageAndCare,
    deliveryInfo,
    badges,
    flavorTags,
    isCustomizable,
    customizationOptions,
    isActive,
    isFeatured,
  } = req.body;

  // Handle images (required)
  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error('At least one image is required');
  }

  const images = await processAndUploadFiles(req.files, 'sweetnest/cakes');

  // Auto-detect flavor tags from name, description, ingredients
  const detectedFlavorTags = getFlavorTags(
    { name, description, ingredients: ingredients || [] },
    flavorTags || [] // Also include any manually provided tags
  );

  // Build cake data (Zod already validated and transformed the data)
  const cakeData = {
    name,
    description,
    category,
    images,
    weightOptions,
    ingredients: ingredients || [],
    storageAndCare,
    deliveryInfo: deliveryInfo || { nextDayAvailable: true },
    badges: badges || [],
    flavorTags: detectedFlavorTags,
    isCustomizable: isCustomizable || false,
    customizationOptions: customizationOptions || [],
    isActive: isActive !== false,
    isFeatured: isFeatured || false,
  };

  const cake = await Cake.create(cakeData);
  await cake.populate('category', 'name slug');

  res.status(201).json({
    success: true,
    message: 'Cake created successfully',
    data: cake,
  });
});

// @desc    Update cake
// @route   PUT /api/cakes/:id
// @access  Private/Admin
const updateCake = asyncHandler(async (req, res) => {
  const cake = await Cake.findById(req.params.id);

  if (!cake) {
    res.status(404);
    throw new Error('Cake not found');
  }

  const {
    name,
    description,
    category,
    weightOptions,
    ingredients,
    storageAndCare,
    deliveryInfo,
    badges,
    flavorTags,
    isCustomizable,
    customizationOptions,
    isActive,
    isFeatured,
    removeImages,
  } = req.body;

  // Update fields (slug is immutable)
  if (name) cake.name = name;
  if (description) cake.description = description;
  if (category) cake.category = category;
  if (storageAndCare !== undefined) cake.storageAndCare = storageAndCare;
  if (isActive !== undefined) cake.isActive = isActive;
  if (isFeatured !== undefined) cake.isFeatured = isFeatured;
  if (isCustomizable !== undefined) cake.isCustomizable = isCustomizable;
  if (weightOptions) cake.weightOptions = weightOptions;
  if (ingredients) cake.ingredients = ingredients;
  if (badges) cake.badges = badges;
  if (deliveryInfo) cake.deliveryInfo = deliveryInfo;
  if (customizationOptions) cake.customizationOptions = customizationOptions;

  // Auto-detect flavor tags if name, description, or ingredients changed
  if (name || description || ingredients) {
    cake.flavorTags = getFlavorTags(
      {
        name: cake.name,
        description: cake.description,
        ingredients: cake.ingredients || [],
      },
      flavorTags || [] // Include any manually provided tags
    );
  } else if (flavorTags) {
    // Only manual tags provided, no auto-detect fields changed
    cake.flavorTags = flavorTags;
  }

  // Handle image removal
  if (removeImages && removeImages.length > 0) {
    await deleteMultipleImages(removeImages);
    cake.images = cake.images.filter((img) => !removeImages.includes(img.public_id));
  }

  // Handle new image uploads
  if (req.files && req.files.length > 0) {
    const newImages = await processAndUploadFiles(req.files, 'sweetnest/cakes');
    cake.images = [...cake.images, ...newImages];
  }

  // Ensure at least one image
  if (cake.images.length === 0) {
    res.status(400);
    throw new Error('Cake must have at least one image');
  }

  const updatedCake = await cake.save();
  await updatedCake.populate('category', 'name slug');

  res.status(200).json({
    success: true,
    message: 'Cake updated successfully',
    data: updatedCake,
  });
});

// @desc    Delete cake
// @route   DELETE /api/cakes/:id
// @access  Private/Admin
const deleteCake = asyncHandler(async (req, res) => {
  const cake = await Cake.findById(req.params.id);

  if (!cake) {
    res.status(404);
    throw new Error('Cake not found');
  }

  // Delete all images from Cloudinary
  if (cake.images && cake.images.length > 0) {
    const publicIds = cake.images.map((img) => img.public_id);
    await deleteMultipleImages(publicIds);
  }

  await Cake.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Cake deleted successfully',
  });
});

// @desc    Get featured cakes
// @route   GET /api/cakes/featured
// @access  Public
const getFeaturedCakes = asyncHandler(async (req, res) => {
  const limit = Math.min(20, parseInt(req.query.limit) || 8);

  const cakes = await Cake.find({ isActive: true, isFeatured: true })
    .populate('category', 'name slug')
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('-__v');

  res.status(200).json({
    success: true,
    message: 'Featured cakes fetched successfully',
    data: cakes,
  });
});

// @desc    Get cakes by category
// @route   GET /api/cakes/category/:categorySlug
// @access  Public
const getCakesByCategory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationOptions(req.query);

  const Category = require('../model/Category');
  const category = await Category.findOne({ slug: req.params.categorySlug });

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  const filter = { category: category._id, isActive: true };

  const [cakes, totalItems] = await Promise.all([
    Cake.find(filter)
      .populate('category', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Cake.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(totalItems, page, limit);

  res.status(200).json({
    success: true,
    message: 'Cakes fetched successfully',
    data: cakes,
    pagination,
  });
});

module.exports = {
  getCakes,
  getCakeBySlug,
  getCakeById,
  createCake,
  updateCake,
  deleteCake,
  getFeaturedCakes,
  getCakesByCategory,
};

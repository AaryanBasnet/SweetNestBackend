/**
 * Category Controller
 * CRUD operations for cake categories
 * Validation is handled by Zod middleware in routes
 */

const asyncHandler = require('express-async-handler');
const Category = require('../model/Category');
const { deleteImage } = require('../config/cloudinary');
const { processAndUploadSingleFile } = require('../middleware/uploadMiddleware');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  const { active } = req.query;

  const filter = {};
  if (active === 'true') {
    filter.isActive = true;
  } else if (active === 'false') {
    filter.isActive = false;
  }

  const categories = await Category.find(filter)
    .sort({ displayOrder: 1, name: 1 })
    .select('-__v');

  res.status(200).json({
    success: true,
    message: 'Categories fetched successfully',
    data: categories,
  });
});

// @desc    Get single category by slug
// @route   GET /api/categories/:slug
// @access  Public
const getCategoryBySlug = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ slug: req.params.slug }).select('-__v');

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  res.status(200).json({
    success: true,
    message: 'Category fetched successfully',
    data: category,
  });
});

// @desc    Create new category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = asyncHandler(async (req, res) => {
  const { name, description, displayOrder, isActive } = req.body;

  // Check if category exists
  const existingCategory = await Category.findOne({
    name: { $regex: new RegExp(`^${name}$`, 'i') },
  });

  if (existingCategory) {
    res.status(400);
    throw new Error('Category with this name already exists');
  }

  // Build category data
  const categoryData = {
    name,
    description,
    displayOrder: displayOrder || 0,
    isActive: isActive !== undefined ? isActive : true,
  };

  // Handle image upload
  if (req.file) {
    categoryData.image = await processAndUploadSingleFile(req.file, 'sweetnest/categories');
  }

  const category = await Category.create(categoryData);

  res.status(201).json({
    success: true,
    message: 'Category created successfully',
    data: category,
  });
});

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = asyncHandler(async (req, res) => {
  const { name, description, displayOrder, isActive } = req.body;

  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  // Check for duplicate name (excluding current category)
  if (name && name !== category.name) {
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      _id: { $ne: req.params.id },
    });

    if (existingCategory) {
      res.status(400);
      throw new Error('Category with this name already exists');
    }
  }

  // Update fields (slug is immutable)
  if (name) category.name = name;
  if (description !== undefined) category.description = description;
  if (displayOrder !== undefined) category.displayOrder = displayOrder;
  if (isActive !== undefined) category.isActive = isActive;

  // Handle image upload
  if (req.file) {
    // Delete old image from Cloudinary
    if (category.image && category.image.public_id) {
      await deleteImage(category.image.public_id);
    }
    category.image = await processAndUploadSingleFile(req.file, 'sweetnest/categories');
  }

  const updatedCategory = await category.save();

  res.status(200).json({
    success: true,
    message: 'Category updated successfully',
    data: updatedCategory,
  });
});

// @desc    Delete category (soft delete)
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  // Check if category has associated products
  const hasProducts = await Category.hasProducts(req.params.id);

  if (hasProducts) {
    // Soft delete - deactivate
    category.isActive = false;
    await category.save();

    res.status(200).json({
      success: true,
      message: 'Category has associated products and was deactivated instead of deleted',
      data: category,
      deactivated: true,
    });
  } else {
    // Soft delete for data integrity
    category.isActive = false;
    await category.save();

    // Delete image from Cloudinary
    if (category.image && category.image.public_id) {
      await deleteImage(category.image.public_id);
      category.image = undefined;
      await category.save();
    }

    res.status(200).json({
      success: true,
      message: 'Category deactivated successfully',
      data: category,
      deactivated: true,
    });
  }
});

// @desc    Permanently delete category (only if no associated products)
// @route   DELETE /api/categories/:id/permanent
// @access  Private/Admin
const permanentDeleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  // Check if category has associated products
  const hasProducts = await Category.hasProducts(req.params.id);

  if (hasProducts) {
    res.status(400);
    throw new Error('Cannot permanently delete category with associated products');
  }

  // Delete image from Cloudinary
  if (category.image && category.image.public_id) {
    await deleteImage(category.image.public_id);
  }

  await Category.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Category permanently deleted',
  });
});

module.exports = {
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  permanentDeleteCategory,
};

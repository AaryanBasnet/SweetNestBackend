/**
 * Category Routes
 * API endpoints for cake categories
 */

const express = require('express');
const router = express.Router();

const {
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  permanentDeleteCategory,
} = require('../controller/categoryController');

const { protect, admin } = require('../middleware/authMiddleware');
const { uploadCategoryImage, handleUploadError } = require('../middleware/uploadMiddleware');
const { validate } = require('../middleware/validateMiddleware');
const {
  createCategorySchema,
  updateCategorySchema,
  getCategoryBySlugSchema,
  deleteCategorySchema,
} = require('../validators/categoryValidators');

// Public routes
router.get('/', getCategories);
router.get('/:slug', validate(getCategoryBySlugSchema), getCategoryBySlug);

// Admin routes
router.post(
  '/',
  protect,
  admin,
  uploadCategoryImage.single('image'),
  handleUploadError,
  validate(createCategorySchema),
  createCategory
);

router.put(
  '/:id',
  protect,
  admin,
  uploadCategoryImage.single('image'),
  handleUploadError,
  validate(updateCategorySchema),
  updateCategory
);

router.delete('/:id', protect, admin, validate(deleteCategorySchema), deleteCategory);
router.delete('/:id/permanent', protect, admin, validate(deleteCategorySchema), permanentDeleteCategory);

module.exports = router;

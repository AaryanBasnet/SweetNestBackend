/**
 * Category Model
 * Standalone model - no dependencies on other models
 * Categories: All Cakes, Cupcakes, Macarons, Wedding, Custom Orders
 *
 * IMPORTANT: Categories should NOT be hard-deleted to prevent orphaned product references.
 * Use isActive for deactivation instead.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

// Generate short unique ID (replacement for nanoid in CommonJS)
const generateId = (length = 4) => crypto.randomBytes(length).toString('hex').slice(0, length);

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
      maxlength: [50, 'Category name cannot exceed 50 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
      immutable: true, // Cannot be changed after creation
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    image: {
      public_id: { type: String },
      url: { type: String },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save: Generate immutable slug from name (only on creation)
// Note: Mongoose 9 uses promises, not callbacks - no 'next' parameter
categorySchema.pre('save', function () {
  console.log('[Category Model] pre-save hook called');
  // Generate slug ONLY if it doesn't exist (immutable after creation)
  if (!this.slug) {
    const baseSlug = this.name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
    // Add short unique suffix to prevent collisions
    const uniqueSuffix = generateId(4);
    this.slug = `${baseSlug}-${uniqueSuffix}`;
    console.log('[Category Model] Generated slug:', this.slug);
  }
  // No next() needed in Mongoose 9 - just return
});

// Pre-findOneAndUpdate: Prevent slug modification
// Note: Mongoose 9 uses promises, not callbacks
categorySchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate();

  // Prevent slug modification
  if (update.slug || update.$set?.slug) {
    delete update.slug;
    if (update.$set) delete update.$set.slug;
  }
  // No next() needed in Mongoose 9
});

// Static method to check if category has associated products
categorySchema.statics.hasProducts = async function (categoryId) {
  const Cake = mongoose.model('Cake');
  const count = await Cake.countDocuments({ category: categoryId });
  return count > 0;
};

// Static method for safe "deletion" (actually deactivation)
categorySchema.statics.safeDelete = async function (categoryId) {
  const category = await this.findById(categoryId);
  if (!category) {
    throw new Error('Category not found');
  }

  // Check for associated products
  const hasProducts = await this.hasProducts(categoryId);
  if (hasProducts) {
    // Soft delete - just deactivate
    category.isActive = false;
    await category.save();
    return {
      deleted: false,
      deactivated: true,
      message: 'Category has associated products and was deactivated instead of deleted',
    };
  }

  // No products - can safely delete (but we still recommend soft delete)
  category.isActive = false;
  await category.save();
  return {
    deleted: false,
    deactivated: true,
    message: 'Category deactivated successfully',
  };
};

// Index for faster queries
categorySchema.index({ isActive: 1, displayOrder: 1 });

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;

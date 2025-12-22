/**
 * Cake Model
 * Represents a configurable, made-to-order service with predefined price slabs
 * NOT a warehouse inventory item
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

// Generate short unique ID (replacement for nanoid in CommonJS)
const generateId = (length = 6) => crypto.randomBytes(length).toString('hex').slice(0, length);

// Sub-schema for weight options with explicit pricing per weight
const weightOptionSchema = new mongoose.Schema(
  {
    weightInKg: {
      type: Number,
      required: [true, 'Weight value is required'],
      min: [0.1, 'Weight must be at least 0.1 kg'],
    },
    label: {
      type: String,
      required: [true, 'Weight label is required'],
      trim: true,
      // e.g., "1 Pound", "500g", "2 kg"
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

// Sub-schema for images (Cloudinary)
const imageSchema = new mongoose.Schema(
  {
    public_id: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

// Sub-schema for customization option choices
const customizationChoiceSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: [true, 'Choice label is required'],
      trim: true,
    },
    extraPrice: {
      type: Number,
      default: 0,
      min: [0, 'Extra price cannot be negative'],
    },
  },
  { _id: false }
);

// Sub-schema for customization options
const customizationOptionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['color', 'topping', 'message', 'flavor', 'decoration', 'size'],
      required: true,
    },
    options: {
      type: [customizationChoiceSchema],
      default: [],
    },
  },
  { _id: false }
);

// Main Cake Schema
const cakeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Cake name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
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
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },

    // Reference to Category (ObjectId only - atomic)
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
      index: true,
    },

    // Images from Cloudinary
    images: {
      type: [imageSchema],
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: 'At least one image is required',
      },
    },

    // Weight-based pricing (non-linear, explicit per option)
    weightOptions: {
      type: [weightOptionSchema],
      validate: [
        {
          validator: function (v) {
            return v && v.length > 0;
          },
          message: 'At least one weight option is required',
        },
        {
          validator: function (v) {
            // Ensure only one default (or none, which we'll fix in pre-save)
            const defaults = v.filter((opt) => opt.isDefault);
            return defaults.length <= 1;
          },
          message: 'Only one weight option can be set as default',
        },
      ],
    },

    // Product details (expandable sections in UI)
    ingredients: {
      type: [String],
      default: [],
    },
    storageAndCare: {
      type: String,
      trim: true,
      maxlength: [1000, 'Storage info cannot exceed 1000 characters'],
    },
    deliveryInfo: {
      nextDayAvailable: {
        type: Boolean,
        default: true,
      },
      deliveryNote: {
        type: String,
        trim: true,
      },
    },

    // Badges (Best Seller, 100% Organic, etc.)
    badges: {
      type: [String],
      enum: ['bestSeller', 'organic', 'newArrival', 'limitedEdition', 'sugarFree', 'vegan'],
      default: [],
    },

    // Flavor tags for filtering (Chocolate, Vanilla, etc.)
    flavorTags: {
      type: [String],
      enum: ['Chocolate', 'Vanilla', 'Fruit', 'Nut', 'Spiced', 'Coffee', 'Caramel', 'Citrus', 'Berry', 'Tropical'],
      default: [],
      index: true,
    },

    // Customization
    isCustomizable: {
      type: Boolean,
      default: false,
    },
    customizationOptions: {
      type: [customizationOptionSchema],
      default: [],
    },

    // Ratings (denormalized for performance)
    ratingsAverage: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be below 0'],
      max: [5, 'Rating cannot exceed 5'],
      set: (val) => Math.round(val * 10) / 10, // Round to 1 decimal
    },
    ratingsCount: {
      type: Number,
      default: 0,
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: basePrice - derived from minimum weight option price
cakeSchema.virtual('basePrice').get(function () {
  if (!this.weightOptions || this.weightOptions.length === 0) {
    return 0;
  }
  return Math.min(...this.weightOptions.map((opt) => opt.price));
});

// Virtual: defaultWeightOption - returns the default weight option
cakeSchema.virtual('defaultWeightOption').get(function () {
  if (!this.weightOptions || this.weightOptions.length === 0) {
    return null;
  }
  return this.weightOptions.find((opt) => opt.isDefault) || this.weightOptions[0];
});

// Pre-save: Generate immutable slug and ensure single default weight option
// Note: Mongoose 9 uses promises, not callbacks - no 'next' parameter
cakeSchema.pre('save', function () {
  // Generate slug ONLY if it doesn't exist (immutable after creation)
  if (!this.slug) {
    const baseSlug = this.name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
    // Add short unique suffix to prevent collisions
    const uniqueSuffix = generateId(6);
    this.slug = `${baseSlug}-${uniqueSuffix}`;
  }

  // Ensure exactly one default weight option
  if (this.weightOptions && this.weightOptions.length > 0) {
    const defaults = this.weightOptions.filter((opt) => opt.isDefault);

    if (defaults.length === 0) {
      // No default set - make first option the default
      this.weightOptions[0].isDefault = true;
    } else if (defaults.length > 1) {
      // Multiple defaults - keep only the first one
      let foundFirst = false;
      this.weightOptions.forEach((opt) => {
        if (opt.isDefault) {
          if (foundFirst) {
            opt.isDefault = false;
          } else {
            foundFirst = true;
          }
        }
      });
    }
  }
  // No next() needed in Mongoose 9
});

// Pre-findOneAndUpdate: Ensure slug is not modified and handle default weight option
// Note: Mongoose 9 uses promises, not callbacks
cakeSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate();

  // Prevent slug modification
  if (update.slug || update.$set?.slug) {
    delete update.slug;
    if (update.$set) delete update.$set.slug;
  }

  // Handle weightOptions default logic in updates
  const weightOptions = update.weightOptions || update.$set?.weightOptions;
  if (weightOptions && weightOptions.length > 0) {
    const defaults = weightOptions.filter((opt) => opt.isDefault);

    if (defaults.length === 0) {
      weightOptions[0].isDefault = true;
    } else if (defaults.length > 1) {
      let foundFirst = false;
      weightOptions.forEach((opt) => {
        if (opt.isDefault) {
          if (foundFirst) {
            opt.isDefault = false;
          } else {
            foundFirst = true;
          }
        }
      });
    }
  }
  // No next() needed in Mongoose 9
});

// Indexes for common queries
cakeSchema.index({ category: 1, isActive: 1 });
cakeSchema.index({ 'weightOptions.price': 1 });
cakeSchema.index({ ratingsAverage: -1 });
cakeSchema.index({ createdAt: -1 });
cakeSchema.index({ badges: 1 });
cakeSchema.index({ name: 'text', description: 'text' });

const Cake = mongoose.model('Cake', cakeSchema);

module.exports = Cake;

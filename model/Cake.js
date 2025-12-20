/**
 * Cake Model
 * References Category by ObjectId only (loose coupling)
 * Based on UI: Tiramisu Royal Layer product page
 */

const mongoose = require('mongoose');

// Sub-schema for weight options (1 POUND @ Rs.550, 2 POUND @ Rs.650)
const weightOptionSchema = new mongoose.Schema(
  {
    weight: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
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
      enum: ['color', 'topping', 'message', 'flavor'],
      required: true,
    },
    options: [String],
    extraPrice: {
      type: Number,
      default: 0,
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

    // Weight-based pricing
    weightOptions: {
      type: [weightOptionSchema],
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: 'At least one weight option is required',
      },
    },

    // Base price (minimum price - smallest weight option)
    basePrice: {
      type: Number,
      required: true,
      min: [0, 'Price cannot be negative'],
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

    // Inventory
    stock: {
      type: Number,
      default: 0,
      min: [0, 'Stock cannot be negative'],
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

// Virtual: Check if in stock
cakeSchema.virtual('inStock').get(function () {
  return this.stock > 0;
});

// Pre-save: Generate slug and set base price
cakeSchema.pre('save', function (next) {
  // Generate slug from name
  if (this.isModified('name') || !this.slug) {
    const timestamp = Date.now().toString(36).slice(-4);
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      + '-' + timestamp;
  }

  // Set base price to minimum weight option price
  if (this.isModified('weightOptions') && this.weightOptions.length > 0) {
    this.basePrice = Math.min(...this.weightOptions.map((opt) => opt.price));
  }

  next();
});

// Indexes for common queries
cakeSchema.index({ category: 1, isActive: 1 });
cakeSchema.index({ basePrice: 1 });
cakeSchema.index({ ratingsAverage: -1 });
cakeSchema.index({ createdAt: -1 });
cakeSchema.index({ badges: 1 });
cakeSchema.index({ name: 'text', description: 'text' });

const Cake = mongoose.model('Cake', cakeSchema);

module.exports = Cake;

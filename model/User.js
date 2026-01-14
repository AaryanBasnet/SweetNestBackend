const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Address schema (embedded subdocument)
const addressSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      enum: ['Home', 'Office', 'Other', 'Custom'],
      required: true,
      default: 'Home',
    },
    customLabel: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      minlength: 5,
      maxlength: 200,
    },
    apartment: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    postalCode: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      minlength: 10,
      maxlength: 20,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Custom validation for customLabel when label is 'Custom'
addressSchema.path('customLabel').validate(function (value) {
  if (this.label === 'Custom') {
    return value && value.trim().length > 0;
  }
  return true;
}, 'Custom label is required when label type is Custom');

// User schema
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      validate: {
        validator: function (v) {
          // Only validate format if password is being modified (not already hashed)
          // Hashed passwords start with $2a$ or $2b$ (bcrypt format)
          if (!this.isModified('password')) return true;
          if (v.startsWith('$2a$') || v.startsWith('$2b$')) return true;

          // Must have: at least 1 uppercase, 1 lowercase, 1 number, 1 special char
          return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(v);
        },
        message:
          'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
      },
    },
    phone: { type: String, trim: true },
    address: { type: String, trim: true }, // DEPRECATED: Use addresses array instead
    avatar: { type: String }, // URL to Cloudinary/S3
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isVerified: { type: Boolean, default: false }, // optional email verification
    addresses: {
      type: [addressSchema],
      validate: {
        validator: function (v) {
          return v.length <= 5;
        },
        message: 'Maximum 5 addresses allowed per user',
      },
      default: [],
    },
    sweetPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    pointsHistory: [
      {
        amount: { type: Number, required: true },
        type: { type: String, enum: ['earned', 'redeemed'], required: true },
        description: { type: String, required: true },
        relatedOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        relatedCoupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Hash password before saving
// Hash password before saving
userSchema.pre('save', async function () {
  // 'this' refers to the current document
  if (!this.isModified('password')) return; // nothing to do
  const salt = await bcrypt.genSalt(12); // stronger salt
  this.password = await bcrypt.hash(this.password, salt);
});


// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;

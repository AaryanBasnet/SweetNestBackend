/**
 * User Controller
 * Authentication and user management operations
 * Validation is handled by Zod middleware in routes
 */

const asyncHandler = require('express-async-handler');
const User = require('../model/User');
const PasswordResetToken = require('../model/PasswordResetToken');
const { sendPasswordResetEmail } = require('../config/email');
const jwt = require('jsonwebtoken');
const { processAndUploadSingleFile } = require('../middleware/uploadMiddleware');
const { deleteImage } = require('../config/cloudinary');

// --- Helper: Generate JWT ---
const generateToken = (id) => {
  // 30 days was far too long for a token that lives in localStorage with no
  // refresh or revocation path. 7 days is the compromise until proper
  // refresh-token rotation lands; override per environment if needed.
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// @desc    Register User (Public registration - always creates 'user' role)
// @route   POST /api/users/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone, address } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  // SECURITY: Public registration always creates 'user' role
  // Admin accounts can only be created by existing admins via /api/users/admin
  const user = await User.create({
    name,
    email,
    password,
    phone,
    address,
    role: 'user',
  });

  if (user) {
    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      token: generateToken(user._id),
      userData: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        avatar: user.avatar,
      },
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Create Admin User (Only existing admins can create new admins)
// @route   POST /api/users/admin
// @access  Private/Admin
const createAdmin = asyncHandler(async (req, res) => {
  const { name, email, password, phone, address } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('User with this email already exists');
  }

  // Create admin user
  const admin = await User.create({
    name,
    email,
    password,
    phone,
    address,
    role: 'admin',
  });

  if (admin) {
    res.status(201).json({
      success: true,
      message: 'Admin created successfully.',
      userData: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        phone: admin.phone,
        address: admin.address,
      },
    });
  } else {
    res.status(400);
    throw new Error('Invalid admin data');
  }
});

// @desc    Login User
// @route   POST /api/users/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');

  if (user && (await user.matchPassword(password))) {
    res.status(200).json({
      success: true,
      message: 'User logged in successfully.',
      token: generateToken(user._id),
      userData: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        avatar: user.avatar,
      },
    });
  } else {
    res.status(401);
    throw new Error('Invalid email or password');
  }
});

// @desc    Get User Profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.status(200).json({
      success: true,
      userData: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        avatar: user.avatar,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Update User Profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  // +password so we can verify the current one before allowing a change.
  const user = await User.findById(req.user._id).select('+password');

  if (user) {
    // Handle avatar upload to Cloudinary
    if (req.file) {
      // Delete old avatar from Cloudinary if it exists
      if (user.avatar) {
        try {
          // Extract public_id from Cloudinary URL
          const urlParts = user.avatar.split('/');
          const filename = urlParts[urlParts.length - 1].split('.')[0];
          const folder = urlParts.slice(-2, -1)[0]; // Get folder name
          const publicId = `sweetnest/${folder}/${filename}`;
          await deleteImage(publicId);
        } catch (error) {
          console.error('Error deleting old avatar:', error);
          // Continue with upload even if delete fails
        }
      }

      // Upload new avatar to Cloudinary
      const uploadResult = await processAndUploadSingleFile(req.file, 'sweetnest/avatars');
      user.avatar = uploadResult.url;
    }

    // Update fields from validated body
    if (req.body.name) user.name = req.body.name;
    if (req.body.email) user.email = req.body.email;
    if (req.body.phone !== undefined) user.phone = req.body.phone;
    if (req.body.address !== undefined) user.address = req.body.address;
    // SECURITY: changing a password requires proving you know the current one.
    // Without this check, anyone holding a stolen token (30-day JWT sitting in
    // localStorage) could lock the real owner out of their own account.
    if (req.body.password) {
      if (!req.body.currentPassword) {
        res.status(400);
        throw new Error('Current password is required to set a new password');
      }

      const currentIsValid = await user.matchPassword(req.body.currentPassword);
      if (!currentIsValid) {
        res.status(401);
        throw new Error('Current password is incorrect');
      }

      if (req.body.currentPassword === req.body.password) {
        res.status(400);
        throw new Error('New password must be different from the current one');
      }

      user.password = req.body.password;
      user.passwordChangedAt = new Date();
    }

    // SECURITY: Role is NOT updated from request body

    const updatedUser = await user.save({ validateModifiedOnly: true });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      token: generateToken(updatedUser._id),
      userData: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        address: updatedUser.address,
        avatar: updatedUser.avatar,
        role: updatedUser.role,
      },
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Forgot Password (Send Reset Code)
// @route   POST /api/users/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  // SECURITY: always answer the same way whether or not the account exists.
  // Returning 404 for unknown emails turned this endpoint into a user
  // enumeration oracle - an attacker could confirm which emails are registered.
  if (user) {
    // Invalidate any code already outstanding for this user
    await PasswordResetToken.deleteMany({ userId: user._id });

    const resetCode = PasswordResetToken.generateCode();

    await PasswordResetToken.create({
      userId: user._id,
      email: user.email,
      codeHash: PasswordResetToken.hashCode(resetCode),
    });

    // A mail delivery failure must not change the shape of the response,
    // that would re-introduce the enumeration leak.
    try {
      await sendPasswordResetEmail(user.email, resetCode);
    } catch (error) {
      console.error('Failed to send password reset email:', error.message);
    }
  }

  res.status(200).json({
    success: true,
    message:
      'If an account exists for that email, a password reset code has been sent.',
  });
});

// @desc    Verify Reset Code
// @route   POST /api/users/verify-reset-code
// @access  Public
const verifyResetCode = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  // Look up by email only - the code is stored as an HMAC, so it is compared
  // in constant time below rather than matched inside the query.
  const resetToken = await PasswordResetToken.findOne({
    email: String(email).toLowerCase().trim(),
  });

  if (!resetToken || resetToken.isExpired()) {
    if (resetToken) await PasswordResetToken.deleteOne({ _id: resetToken._id });
    res.status(400);
    throw new Error('Invalid or expired verification code');
  }

  if (!resetToken.matchesCode(code)) {
    // Burn the token after too many wrong guesses, so a 6-digit code cannot be
    // brute forced by an attacker who rotates IPs past the rate limiter.
    const exhausted = await resetToken.registerFailedAttempt();
    if (exhausted) {
      await PasswordResetToken.deleteOne({ _id: resetToken._id });
      res.status(400);
      throw new Error('Too many incorrect attempts. Please request a new code.');
    }

    res.status(400);
    throw new Error('Invalid or expired verification code');
  }

  resetToken.verified = true;
  resetToken.attempts = 0;
  await resetToken.save();

  res.status(200).json({
    success: true,
    message: 'Code verified successfully',
  });
});

// @desc    Reset Password
// @route   POST /api/users/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, newPassword } = req.body;

  const resetToken = await PasswordResetToken.findOne({
    email: String(email).toLowerCase().trim(),
    verified: true,
  });

  if (!resetToken || resetToken.isExpired() || !resetToken.matchesCode(code)) {
    if (resetToken && resetToken.isExpired()) {
      await PasswordResetToken.deleteOne({ _id: resetToken._id });
    }
    res.status(400);
    throw new Error('Invalid or expired reset code. Please request a new one.');
  }

  const user = await User.findById(resetToken.userId);

  if (!user) {
    res.status(400);
    throw new Error('Invalid or expired reset code. Please request a new one.');
  }

  // Update password (hashed by the pre-save hook). Stamping passwordChangedAt
  // invalidates every JWT issued before this moment, so an attacker holding a
  // stolen token loses access the instant the real owner resets.
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  // Delete the reset token
  await PasswordResetToken.deleteOne({ _id: resetToken._id });

  res.status(200).json({
    success: true,
    message: 'Password reset successfully. You can now login with your new password',
  });
});

// @desc    Get all customers (users)
// @route   GET /api/users/customers
// @access  Private/Admin
const getAllCustomers = asyncHandler(async (req, res) => {
  const { search, sort = 'createdAt', order = 'desc', page = 1, limit = 10 } = req.query;

  // --- PART 1: Table Data (Search & Pagination) ---
  const matchStage = { role: 'user' };
  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    matchStage.$or = [{ name: searchRegex }, { email: searchRegex }];
  }

  // Define the pipeline for the table data
  const tablePipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'orders',
        localField: '_id',
        foreignField: 'user',
        as: 'orderHistory'
      }
    },
    {
      $project: {
        _id: 1, name: 1, email: 1, phone: 1, avatar: 1, createdAt: 1,
        orders: { $size: '$orderHistory' },
        totalSpent: { $sum: '$orderHistory.total' }
      }
    },
    { $sort: { [sort]: order === 'asc' ? 1 : -1 } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: (parseInt(page) - 1) * parseInt(limit) }, { $limit: parseInt(limit) }]
      }
    }
  ];

  // --- PART 2: Global Stats (For the top cards) ---
  // We calculate this separately so it doesn't change when you type in the search bar
  const statsPipeline = [
    { $match: { role: 'user' } }, // Match ALL users
    {
      $lookup: {
        from: 'orders',
        localField: '_id',
        foreignField: 'user',
        as: 'orderHistory'
      }
    },
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        totalRevenue: { $sum: { $sum: "$orderHistory.total" } }, // Sum of all users' totals
        totalOrders: { $sum: { $size: "$orderHistory" } }
      }
    }
  ];

  // Run both queries in parallel for performance
  const [tableResults, statsResults] = await Promise.all([
    User.aggregate(tablePipeline),
    User.aggregate(statsPipeline)
  ]);

  // Extract Data
  const customers = tableResults[0].data;
  const totalFiltered = tableResults[0].metadata[0] ? tableResults[0].metadata[0].total : 0;
  
  // Extract Stats (Default to 0 if no users exist)
  const stats = statsResults[0] || { totalCustomers: 0, totalRevenue: 0, totalOrders: 0 };

  res.status(200).json({
    success: true,
    customers, // The 10 rows for the table
    stats,     // The big numbers for the top cards
    pagination: {
      total: totalFiltered,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(totalFiltered / limit),
    }
  });
});

module.exports = {
  registerUser,
  createAdmin,
  loginUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  getAllCustomers,
};

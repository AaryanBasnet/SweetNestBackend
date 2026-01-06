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

// --- Helper: Generate JWT ---
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
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

  const user = await User.findOne({ email });


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
  const user = await User.findById(req.user._id);

  if (user) {
    // Update fields from validated body
    if (req.body.name) user.name = req.body.name;
    if (req.body.email) user.email = req.body.email;
    if (req.body.phone !== undefined) user.phone = req.body.phone;
    if (req.body.address !== undefined) user.address = req.body.address;
    if (req.body.avatar) user.avatar = req.body.avatar;
    if (req.body.password) user.password = req.body.password;

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

  if (!user) {
    res.status(404);
    throw new Error('No account found with this email');
  }

  // Delete any existing reset tokens for this user
  await PasswordResetToken.deleteMany({ userId: user._id });

  // Generate new reset code
  const resetCode = PasswordResetToken.generateCode();

  // Save reset token
  await PasswordResetToken.create({
    userId: user._id,
    email,
    code: resetCode,
  });

  // Send email
  await sendPasswordResetEmail(email, resetCode);

  res.status(200).json({
    success: true,
    message: 'Password reset code sent to your email',
  });
});

// @desc    Verify Reset Code
// @route   POST /api/users/verify-reset-code
// @access  Public
const verifyResetCode = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  const resetToken = await PasswordResetToken.findOne({ email, code });

  if (!resetToken) {
    res.status(400);
    throw new Error('Invalid verification code');
  }

  // Check if code has expired
  if (resetToken.expiresAt < new Date()) {
    await PasswordResetToken.deleteOne({ _id: resetToken._id });
    res.status(400);
    throw new Error('Verification code has expired. Please request a new one');
  }

  // Mark as verified
  resetToken.verified = true;
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

  // Find verified reset token
  const resetToken = await PasswordResetToken.findOne({
    email,
    code,
    verified: true,
  });

  if (!resetToken) {
    res.status(400);
    throw new Error('Invalid or unverified reset code. Please verify your code first');
  }

  // Check if code has expired
  if (resetToken.expiresAt < new Date()) {
    await PasswordResetToken.deleteOne({ _id: resetToken._id });
    res.status(400);
    throw new Error('Reset code has expired. Please request a new one');
  }

  // Find user and update password
  const user = await User.findById(resetToken.userId);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Update password (will be hashed by pre-save hook)
  user.password = newPassword;
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

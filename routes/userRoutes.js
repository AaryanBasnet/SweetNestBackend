/**
 * User Routes
 * API endpoints for authentication and user management
 */

const express = require('express');
const router = express.Router();

const {
  registerUser,
  createAdmin,
  loginUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  verifyResetCode,
  resetPassword,
} = require('../controller/userController');

const { protect, admin } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
} = require('../validators/userValidators');

// Public routes
router.post('/register', validate(registerSchema), registerUser);
router.post('/login', validate(loginSchema), loginUser);

// Password reset routes (Public)
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/verify-reset-code', validate(verifyResetCodeSchema), verifyResetCode);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);

// Protected routes (requires JWT)
router
  .route('/profile')
  .get(protect, getUserProfile)
  .put(protect, validate(updateProfileSchema), updateUserProfile);

// Admin-only routes (requires JWT + admin role)
router.post('/admin', protect, admin, validate(registerSchema), createAdmin);

module.exports = router;

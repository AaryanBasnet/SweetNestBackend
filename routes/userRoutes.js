/**
 * User Routes
 * API endpoints for authentication and user management
 */

const express = require("express");
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
  getAllCustomers,
} = require("../controller/userController");

const { protect, admin } = require("../middleware/authMiddleware");
const {
  authLimiter,
  passwordResetRequestLimiter,
  passwordResetVerifyLimiter,
} = require("../middleware/rateLimitMiddleware");
const { validate } = require("../middleware/validateMiddleware");
const { uploadCakeImages } = require("../middleware/uploadMiddleware");
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
} = require("../validators/userValidators");

// Public routes
// Rate limited: these are the endpoints an attacker can hammer for free -
// password guessing, email bombing, and brute forcing the 6-digit reset code.
router.post("/register", authLimiter, validate(registerSchema), registerUser);
router.post("/login", authLimiter, validate(loginSchema), loginUser);

// Password reset routes (Public)
router.post(
  "/forgot-password",
  passwordResetRequestLimiter,
  validate(forgotPasswordSchema),
  forgotPassword
);
router.post(
  "/verify-reset-code",
  passwordResetVerifyLimiter,
  validate(verifyResetCodeSchema),
  verifyResetCode
);
router.post(
  "/reset-password",
  passwordResetVerifyLimiter,
  validate(resetPasswordSchema),
  resetPassword
);

// Protected routes (requires JWT)
router
  .route("/profile")
  .get(protect, getUserProfile)
  .put(
    protect,
    uploadCakeImages.single('avatar'),
    validate(updateProfileSchema),
    updateUserProfile
  );

// Admin-only routes (requires JWT + admin role)
router.post("/admin", protect, admin, validate(registerSchema), createAdmin);

router.get(
  "/customers",
  protect,
  admin,

  getAllCustomers
);

module.exports = router;

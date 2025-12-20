/**
 * User Validation Schemas
 * Zod schemas for user-related requests
 */

const { z } = require('zod');

// Password regex: at least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const registerSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Name is required' })
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name cannot exceed 50 characters')
      .trim(),
    email: z
      .string({ required_error: 'Email is required' })
      .email('Please enter a valid email')
      .trim()
      .toLowerCase(),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters')
      .regex(
        passwordRegex,
        'Password must include uppercase, lowercase, number, and special character'
      ),
    phone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    role: z.enum(['user', 'admin']).default('user').optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Please enter a valid email')
      .trim()
      .toLowerCase(),
    password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
  }),
});

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(50).trim().optional(),
    email: z.string().email('Please enter a valid email').trim().toLowerCase().optional(),
    phone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    avatar: z.string().url('Avatar must be a valid URL').optional(),
    password: z
      .string()
      .min(8)
      .regex(passwordRegex, 'Password must include uppercase, lowercase, number, and special character')
      .optional(),
  }),
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Please enter a valid email')
      .trim()
      .toLowerCase(),
  }),
});

const verifyResetCodeSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Please enter a valid email')
      .trim()
      .toLowerCase(),
    code: z
      .string({ required_error: 'Verification code is required' })
      .length(6, 'Verification code must be 6 digits'),
  }),
});

const resetPasswordSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Please enter a valid email')
      .trim()
      .toLowerCase(),
    code: z
      .string({ required_error: 'Verification code is required' })
      .length(6, 'Verification code must be 6 digits'),
    newPassword: z
      .string({ required_error: 'New password is required' })
      .min(8, 'Password must be at least 8 characters')
      .regex(
        passwordRegex,
        'Password must include uppercase, lowercase, number, and special character'
      ),
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
};

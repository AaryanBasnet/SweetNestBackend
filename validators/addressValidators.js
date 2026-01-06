/**
 * Address Validators
 * Zod validation schemas for address management endpoints
 */

const { z } = require('zod');

// Base address data schema (reusable)
const addressDataSchema = z.object({
  label: z.enum(['Home', 'Office', 'Other', 'Custom'], {
    required_error: 'Address label is required',
  }),
  customLabel: z
    .string()
    .trim()
    .max(30, 'Custom label must be at most 30 characters')
    .optional()
    .or(z.literal('')),
  firstName: z
    .string({ required_error: 'First name is required' })
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be at most 50 characters')
    .trim(),
  lastName: z
    .string({ required_error: 'Last name is required' })
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be at most 50 characters')
    .trim(),
  address: z
    .string({ required_error: 'Address is required' })
    .min(5, 'Address must be at least 5 characters')
    .max(200, 'Address must be at most 200 characters')
    .trim(),
  apartment: z
    .string()
    .trim()
    .max(50, 'Apartment must be at most 50 characters')
    .optional()
    .or(z.literal('')),
  city: z
    .string({ required_error: 'City is required' })
    .min(2, 'City must be at least 2 characters')
    .max(100, 'City must be at most 100 characters')
    .trim(),
  postalCode: z
    .string()
    .trim()
    .max(20, 'Postal code must be at most 20 characters')
    .optional()
    .or(z.literal('')),
  phone: z
    .string({ required_error: 'Phone is required' })
    .min(10, 'Phone must be at least 10 digits')
    .max(20, 'Phone must be at most 20 characters')
    .trim(),
}).refine(
  (data) => {
    // If label is 'Custom', customLabel is required and not empty
    if (data.label === 'Custom') {
      return data.customLabel && data.customLabel.trim().length > 0;
    }
    return true;
  },
  {
    message: 'Custom label is required when label type is Custom',
    path: ['customLabel'],
  }
);

// Create address schema
const createAddressSchema = z.object({
  body: addressDataSchema,
});

// Update address schema (all fields optional for partial updates)
const updateAddressSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Address ID is required' }),
  }),
  body: addressDataSchema.partial(),
});

// Delete address schema
const deleteAddressSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Address ID is required' }),
  }),
});

// Get address schema
const getAddressSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Address ID is required' }),
  }),
});

// Set default address schema
const setDefaultAddressSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Address ID is required' }),
  }),
});

module.exports = {
  createAddressSchema,
  updateAddressSchema,
  deleteAddressSchema,
  getAddressSchema,
  setDefaultAddressSchema,
};

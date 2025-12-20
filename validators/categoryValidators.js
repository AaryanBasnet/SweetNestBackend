/**
 * Category Validation Schemas
 * Zod schemas for category-related requests
 */

const { z } = require('zod');

const createCategorySchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Category name is required' })
      .min(1, 'Category name is required')
      .max(50, 'Category name cannot exceed 50 characters')
      .trim(),
    description: z
      .string()
      .max(500, 'Description cannot exceed 500 characters')
      .trim()
      .optional(),
    displayOrder: z
      .union([z.string(), z.number()])
      .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
      .pipe(z.number().int().min(0))
      .optional()
      .default(0),
    isActive: z
      .union([z.string(), z.boolean()])
      .transform((val) => val === true || val === 'true')
      .optional()
      .default(true),
  }),
});

const updateCategorySchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Category ID is required' }),
  }),
  body: z.object({
    name: z.string().min(1).max(50).trim().optional(),
    description: z.string().max(500).trim().optional(),
    displayOrder: z
      .union([z.string(), z.number()])
      .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
      .pipe(z.number().int().min(0))
      .optional(),
    isActive: z
      .union([z.string(), z.boolean()])
      .transform((val) => val === true || val === 'true')
      .optional(),
  }),
});

const getCategoryBySlugSchema = z.object({
  params: z.object({
    slug: z.string({ required_error: 'Category slug is required' }),
  }),
});

const deleteCategorySchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Category ID is required' }),
  }),
});

const getCategoriesQuerySchema = z.object({
  query: z.object({
    active: z.enum(['true', 'false', 'all']).optional(),
  }),
});

module.exports = {
  createCategorySchema,
  updateCategorySchema,
  getCategoryBySlugSchema,
  deleteCategorySchema,
  getCategoriesQuerySchema,
};

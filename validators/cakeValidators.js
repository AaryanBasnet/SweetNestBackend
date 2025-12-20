/**
 * Cake Validation Schemas
 * Zod schemas for cake-related requests
 */

const { z } = require('zod');

// Weight option schema
const weightOptionSchema = z.object({
  weightInKg: z
    .number({ required_error: 'Weight value is required' })
    .positive('Weight must be positive'),
  label: z
    .string({ required_error: 'Weight label is required' })
    .min(1, 'Weight label is required')
    .trim(),
  price: z
    .number({ required_error: 'Price is required' })
    .min(0, 'Price cannot be negative'),
  isDefault: z.boolean().optional().default(false),
});

// Customization choice schema
const customizationChoiceSchema = z.object({
  label: z.string().min(1, 'Choice label is required').trim(),
  extraPrice: z.number().min(0).optional().default(0),
});

// Customization option schema
const customizationOptionSchema = z.object({
  name: z.string().min(1, 'Option name is required').trim(),
  type: z.enum(['color', 'topping', 'message', 'flavor', 'decoration', 'size']),
  options: z.array(customizationChoiceSchema).default([]),
});

// Delivery info schema
const deliveryInfoSchema = z.object({
  nextDayAvailable: z.boolean().optional().default(true),
  deliveryNote: z.string().trim().optional(),
});

// Helper to parse JSON strings or return the value
const jsonOrValue = (schema) =>
  z.union([z.string(), schema]).transform((val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  });

// Helper for boolean from string or boolean
const booleanFromAny = z
  .union([z.string(), z.boolean()])
  .transform((val) => val === true || val === 'true');

const createCakeSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Cake name is required' })
      .min(1, 'Cake name is required')
      .max(100, 'Name cannot exceed 100 characters')
      .trim(),
    description: z
      .string({ required_error: 'Description is required' })
      .min(1, 'Description is required')
      .max(1000, 'Description cannot exceed 1000 characters')
      .trim(),
    category: z.string({ required_error: 'Category is required' }),
    weightOptions: jsonOrValue(
      z
        .array(weightOptionSchema)
        .min(1, 'At least one weight option is required')
    ),
    ingredients: jsonOrValue(z.array(z.string().trim())).optional().default([]),
    storageAndCare: z.string().max(1000).trim().optional(),
    deliveryInfo: jsonOrValue(deliveryInfoSchema).optional().default({ nextDayAvailable: true }),
    badges: jsonOrValue(
      z.array(z.enum(['bestSeller', 'organic', 'newArrival', 'limitedEdition', 'sugarFree', 'vegan']))
    ).optional().default([]),
    isCustomizable: booleanFromAny.optional().default(false),
    customizationOptions: jsonOrValue(z.array(customizationOptionSchema)).optional().default([]),
    isActive: booleanFromAny.optional().default(true),
    isFeatured: booleanFromAny.optional().default(false),
  }),
});

const updateCakeSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Cake ID is required' }),
  }),
  body: z.object({
    name: z.string().min(1).max(100).trim().optional(),
    description: z.string().min(1).max(1000).trim().optional(),
    category: z.string().optional(),
    weightOptions: jsonOrValue(
      z.array(weightOptionSchema).min(1, 'At least one weight option is required')
    ).optional(),
    ingredients: jsonOrValue(z.array(z.string().trim())).optional(),
    storageAndCare: z.string().max(1000).trim().optional(),
    deliveryInfo: jsonOrValue(deliveryInfoSchema).optional(),
    badges: jsonOrValue(
      z.array(z.enum(['bestSeller', 'organic', 'newArrival', 'limitedEdition', 'sugarFree', 'vegan']))
    ).optional(),
    isCustomizable: booleanFromAny.optional(),
    customizationOptions: jsonOrValue(z.array(customizationOptionSchema)).optional(),
    isActive: booleanFromAny.optional(),
    isFeatured: booleanFromAny.optional(),
    removeImages: jsonOrValue(z.array(z.string())).optional(),
  }),
});

const getCakeBySlugSchema = z.object({
  params: z.object({
    slug: z.string({ required_error: 'Cake slug is required' }),
  }),
});

const getCakeByIdSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Cake ID is required' }),
  }),
});

const deleteCakeSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Cake ID is required' }),
  }),
});

const getCakesQuerySchema = z.object({
  query: z.object({
    category: z.string().optional(),
    badge: z.string().optional(),
    minPrice: z
      .string()
      .transform((val) => parseFloat(val))
      .pipe(z.number().min(0))
      .optional(),
    maxPrice: z
      .string()
      .transform((val) => parseFloat(val))
      .pipe(z.number().min(0))
      .optional(),
    search: z.string().optional(),
    featured: z.enum(['true', 'false']).optional(),
    active: z.enum(['true', 'false', 'all']).optional(),
    sort: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const getCakesByCategorySchema = z.object({
  params: z.object({
    categorySlug: z.string({ required_error: 'Category slug is required' }),
  }),
});

module.exports = {
  createCakeSchema,
  updateCakeSchema,
  getCakeBySlugSchema,
  getCakeByIdSchema,
  deleteCakeSchema,
  getCakesQuerySchema,
  getCakesByCategorySchema,
  weightOptionSchema,
  customizationOptionSchema,
};

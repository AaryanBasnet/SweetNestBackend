/**
 * Cake Validation Schemas
 * Zod schemas for cake-related requests
 */

const { z } = require('zod');

// --- HELPERS ---
// Handle JSON strings from FormData (e.g., "[{...}]")
const jsonOrValue = (schema) =>
  z.union([z.string(), schema]).transform((val) => {
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return val; }
    }
    return val;
  });

// Handle "true"/"false" strings from FormData
const booleanFromAny = z
  .union([z.string(), z.boolean()])
  .transform((val) => val === true || val === 'true');

// --- SHARED SUB-SCHEMAS ---
const weightOptionSchema = z.object({
  weightInKg: z.coerce.number({ required_error: 'Weight value is required' }).positive(),
  
  label: z.string().min(1, 'Weight label is required').trim(),
  
  price: z.coerce.number({ required_error: 'Price is required' }).min(0, 'Price cannot be negative'),
  
  isDefault: z.boolean().optional().default(false),
});

const customizationChoiceSchema = z.object({
  label: z.string().min(1).trim(),
  extraPrice: z.number().min(0).optional().default(0),
});

const customizationOptionSchema = z.object({
  name: z.string().min(1).trim(),
  type: z.enum(['color', 'topping', 'message', 'flavor', 'decoration', 'size']),
  options: z.array(customizationChoiceSchema).default([]),
});

const deliveryInfoSchema = z.object({
  nextDayAvailable: z.boolean().optional().default(true),
  deliveryNote: z.string().trim().optional(),
});

// --- MAIN SCHEMAS (UNWRAPPED) ---

// 1. Create Cake (Direct Body Object)
const createCakeSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().min(1).max(1000).trim(),
  category: z.string({ required_error: 'Category is required' }),
  
  // Arrays/Objects (Using jsonOrValue to handle FormData strings)
  weightOptions: jsonOrValue(z.array(weightOptionSchema).min(1, 'At least one weight option required')),
  ingredients: jsonOrValue(z.array(z.string().trim())).optional().default([]),
  storageAndCare: z.string().max(1000).trim().optional(),
  deliveryInfo: jsonOrValue(deliveryInfoSchema).optional().default({ nextDayAvailable: true }),
  
  // Simplified badges check (allows strings)
  badges: jsonOrValue(z.array(z.string())).optional().default([]), 
  
  isCustomizable: booleanFromAny.optional().default(false),
  customizationOptions: jsonOrValue(z.array(customizationOptionSchema)).optional().default([]),
  isActive: booleanFromAny.optional().default(true),
  isFeatured: booleanFromAny.optional().default(false),
});

// 2. Update Cake Body (Direct Body Object)
const updateCakeBodySchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  description: z.string().min(1).max(1000).trim().optional(),
  category: z.string().optional(),
  weightOptions: jsonOrValue(z.array(weightOptionSchema).min(1)).optional(),
  ingredients: jsonOrValue(z.array(z.string().trim())).optional(),
  storageAndCare: z.string().max(1000).trim().optional(),
  deliveryInfo: jsonOrValue(deliveryInfoSchema).optional(),
  badges: jsonOrValue(z.array(z.string())).optional(),
  isCustomizable: booleanFromAny.optional(),
  customizationOptions: jsonOrValue(z.array(customizationOptionSchema)).optional(),
  isActive: booleanFromAny.optional(),
  isFeatured: booleanFromAny.optional(),
  removeImages: jsonOrValue(z.array(z.string())).optional(),
});

// 3. ID Param Schema (Reusable)
const cakeIdParamSchema = z.object({
  id: z.string({ required_error: 'Cake ID is required' }),
});

// 4. Other Schemas (Wrapped for existing routes)
const getCakeBySlugSchema = z.object({
  params: z.object({ slug: z.string() }),
});

const getCakeByIdSchema = z.object({
  params: cakeIdParamSchema,
});

const deleteCakeSchema = z.object({
  params: cakeIdParamSchema,
});

const getCakesByCategorySchema = z.object({
  params: z.object({ categorySlug: z.string() }),
});

// Query Schema (Wrapped)
const getCakesQuerySchema = z.object({
  query: z.object({
    category: z.string().optional(),
    badge: z.string().optional(),
    minPrice: z.string().optional(), // Transformed in controller or middleware
    maxPrice: z.string().optional(),
    search: z.string().optional(),
    featured: z.enum(['true', 'false']).optional(),
    active: z.enum(['true', 'false', 'all']).optional(),
    sort: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

module.exports = {
  createCakeSchema,
  updateCakeBodySchema, // Exporting new name
  cakeIdParamSchema,    // Exporting param schema
  getCakeBySlugSchema,
  getCakeByIdSchema,
  deleteCakeSchema,
  getCakesQuerySchema,
  getCakesByCategorySchema,
  weightOptionSchema,
  customizationOptionSchema,
};
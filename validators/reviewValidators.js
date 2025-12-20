/**
 * Review Validation Schemas
 * Zod schemas for review-related requests
 */

const { z } = require('zod');

const createReviewSchema = z.object({
  params: z.object({
    cakeId: z.string({ required_error: 'Cake ID is required' }),
  }),
  body: z.object({
    rating: z
      .number({ required_error: 'Rating is required' })
      .int('Rating must be a whole number')
      .min(1, 'Rating must be at least 1')
      .max(5, 'Rating cannot exceed 5'),
    comment: z
      .string({ required_error: 'Comment is required' })
      .min(1, 'Comment is required')
      .max(1000, 'Comment cannot exceed 1000 characters')
      .trim(),
  }),
});

const updateReviewSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Review ID is required' }),
  }),
  body: z.object({
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().min(1).max(1000).trim().optional(),
  }),
});

const deleteReviewSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Review ID is required' }),
  }),
});

const getCakeReviewsSchema = z.object({
  params: z.object({
    cakeId: z.string({ required_error: 'Cake ID is required' }),
  }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const markHelpfulSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Review ID is required' }),
  }),
});

const approveReviewSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Review ID is required' }),
  }),
  body: z.object({
    isApproved: z.boolean({ required_error: 'isApproved is required' }),
  }),
});

const getAllReviewsQuerySchema = z.object({
  query: z.object({
    approved: z.enum(['true', 'false']).optional(),
    cakeId: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

module.exports = {
  createReviewSchema,
  updateReviewSchema,
  deleteReviewSchema,
  getCakeReviewsSchema,
  markHelpfulSchema,
  approveReviewSchema,
  getAllReviewsQuerySchema,
};

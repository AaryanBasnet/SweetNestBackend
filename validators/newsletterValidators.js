/**
 * Newsletter Validation Schemas
 */

const { z } = require('zod');

const subscribeSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Please enter a valid email')
      .max(254, 'Email is too long'),
    // Honeypot field - see newsletterController
    website: z.string().max(200).optional(),
  }),
});

module.exports = { subscribeSchema };

/**
 * Zod Validation Middleware
 * Validates request body, params, and query against Zod schemas
 */

const { ZodError } = require('zod');

/**
 * Creates a validation middleware for a given Zod schema
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
const validate = (schema) => {
  return async (req, res, next) => {
    try {
      // Validate and transform the request data
      const validated = await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
      });

      // Replace request data with validated/transformed data
      req.body = validated.body ?? req.body;
      req.params = validated.params ?? req.params;
      req.query = validated.query ?? req.query;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors into readable messages
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      // Re-throw non-Zod errors
      next(error);
    }
  };
};

/**
 * Validates only the request body (for simpler routes)
 * @param {import('zod').ZodSchema} schema - Zod schema for body
 * @returns {Function} Express middleware function
 */
const validateBody = (schema) => {
  return async (req, res, next) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      next(error);
    }
  };
};

/**
 * Validates only the request params
 * @param {import('zod').ZodSchema} schema - Zod schema for params
 * @returns {Function} Express middleware function
 */
const validateParams = (schema) => {
  return async (req, res, next) => {
    try {
      req.params = await schema.parseAsync(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      next(error);
    }
  };
};

/**
 * Validates only the request query
 * @param {import('zod').ZodSchema} schema - Zod schema for query
 * @returns {Function} Express middleware function
 */
const validateQuery = (schema) => {
  return async (req, res, next) => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      next(error);
    }
  };
};

module.exports = {
  validate,
  validateBody,
  validateParams,
  validateQuery,
};

/**
 * Zod Validation Middleware
 * Validates request body, params, and query against Zod schemas
 */

const { ZodError } = require('zod');

/**
 * Creates a validation middleware for a given Zod schema
 * Expects schema to verify the full object: { body, params, query }
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
      handleZodError(error, res, next);
    }
  };
};

/**
 * Validates only the request body
 */
const validateBody = (schema) => {
  return async (req, res, next) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      handleZodError(error, res, next);
    }
  };
};

/**
 * Validates only the request params
 */
const validateParams = (schema) => {
  return async (req, res, next) => {
    try {
      req.params = await schema.parseAsync(req.params);
      next();
    } catch (error) {
      handleZodError(error, res, next);
    }
  };
};

/**
 * Validates only the request query
 */
const validateQuery = (schema) => {
  return async (req, res, next) => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      handleZodError(error, res, next);
    }
  };
};

/**
 * Shared Error Handler helper
 * Prevents "Cannot read properties of undefined" crashes
 */
const handleZodError = (error, res, next) => {
  // 1. Log the raw error so you can see it in the terminal
  console.error(">> Validation Error Caught:", error);

  if (error instanceof ZodError) {
    // 2. Safe mapping (check if errors array exists)
    const errorList = error.errors || [];
    
    const errors = errorList.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  // 3. Handle non-Zod errors (like syntax errors) gracefully
  return res.status(500).json({
    success: false,
    message: 'Internal Server Error during validation',
    error: error.message
  });
};

module.exports = {
  validate,
  validateBody,
  validateParams,
  validateQuery,
};
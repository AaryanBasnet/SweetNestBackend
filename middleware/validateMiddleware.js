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
 * Shared Zod error -> HTTP 400 mapper.
 *
 * NOTE: Zod v4 exposes issues on `error.issues`. The v3 `error.errors` alias was
 * removed, so reading `.errors` here silently produced an empty array and every
 * validation failure came back with no field information.
 */
const handleZodError = (error, res, next) => {
  if (error instanceof ZodError) {
    const errors = error.issues.map((issue) => ({
      // Strip the leading 'body' / 'params' / 'query' segment added by validate()
      // so the frontend gets the field name it actually rendered.
      field: issue.path
        .filter((segment, index) =>
          !(index === 0 && ['body', 'params', 'query'].includes(segment))
        )
        .join('.'),
      message: issue.message,
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  // Not a validation problem - hand it to the central error handler so it gets
  // logged and formatted like any other unexpected failure.
  return next(error);
};

module.exports = {
  validate,
  validateBody,
  validateParams,
  validateQuery,
};

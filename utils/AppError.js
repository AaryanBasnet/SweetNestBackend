/**
 * A failure the application expects and knows how to explain.
 *
 * Why this exists
 * ---------------
 * Controllers currently signal failure by mutating the response before
 * throwing:
 *
 *     res.status(400);
 *     throw new Error('Your cart is empty');
 *
 * That works, but it welds the business rule to the HTTP layer. A service
 * that has to touch `res` cannot be called from a background job, a scheduled
 * task, or a test, and it cannot be reused by anything that is not an Express
 * request. It also relies on the error handler reading a status that was
 * stashed on a different object, which breaks the moment two things write to
 * `res.statusCode` in one request.
 *
 * With AppError a service throws a fact about the domain - "this coupon has
 * expired", 400 - and the HTTP layer decides what to do with it. The service
 * stays a plain function.
 *
 * `isOperational` marks the difference between "the user did something we
 * anticipated" and a genuine bug. Operational errors are safe to show to the
 * customer; anything else is a 500 with a generic message, because unexpected
 * error text leaks internals.
 */
class AppError extends Error {
  constructor(message, statusCode = 400, details = undefined) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = true;
    if (details !== undefined) this.details = details;

    // Keep this constructor out of the stack trace, so the trace points at
    // the line that actually threw.
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Shorthand builders for the statuses this API actually uses. */
const badRequest = (message, details) => new AppError(message, 400, details);
const unauthorized = (message = "Not authorized") => new AppError(message, 401);
const forbidden = (message = "Forbidden") => new AppError(message, 403);
const notFound = (message = "Not found") => new AppError(message, 404);
const conflict = (message) => new AppError(message, 409);

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
};

// middleware/errorMiddleware.js

const logger = require("../config/logger");
const { captureError } = require("../config/sentry");

const isProd = process.env.NODE_ENV === "production";

// Handles 404 errors
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Central error handler.
 *
 * Express recognises error middleware by its arity, so the unused `next`
 * parameter must stay - removing it silently turns this into ordinary
 * middleware that never runs.
 */
const errorHandler = (err, req, res, next) => {
  // An AppError carries its own status, which is the reliable source: it
  // travels with the error itself rather than depending on a controller
  // having remembered to set res.status() before throwing. Fall back to the
  // response status for the older controllers that still do it that way.
  const statusCode =
    err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);

  // Prefer the per-request child logger (it carries the request id) and fall
  // back to the base logger if the request never reached pino-http.
  const log = req.log || logger;

  if (statusCode >= 500) {
    // Server faults are ours to fix, so keep the whole error including stack.
    log.error({ err, statusCode }, "Request failed");

    // Only 5xx goes to Sentry. Sending 4xx too would bury real defects under
    // a pile of validation failures and wrong passwords.
    captureError(err, {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      userId: req.user && req.user._id,
    });
  } else {
    // 4xx is the client being told no - normal API behaviour. Logged at warn
    // without a stack, so genuine faults stay visible above the noise.
    log.warn({ statusCode, reason: err.message }, "Request rejected");
  }

  res.status(statusCode);
  res.json({
    success: false,
    message: err.message,
    // Echoing the request id lets a user quote it in a bug report and lets
    // you find the exact log line for their failure in seconds.
    requestId: req.id,
    // Never leak a stack trace to a client in production - it maps out your
    // filesystem and dependency versions for an attacker.
    stack: isProd ? undefined : err.stack,
  });
};

module.exports = { notFound, errorHandler };

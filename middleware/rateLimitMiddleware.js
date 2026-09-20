/**
 * Rate Limiting Middleware
 *
 * Abuse controls for the endpoints an attacker can hammer for free:
 *  - login            -> password brute force
 *  - forgot-password  -> email bombing a victim's inbox
 *  - verify-reset-code -> brute forcing the 6-digit reset code
 *  - contact          -> unauthenticated spam relay
 *
 * NOTE: the default store is in-memory, so counters are per-process and reset
 * on restart. That is fine for a single instance; move to a Redis store
 * (rate-limit-redis) before running more than one Node process.
 */

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Limits get in the way of local development and tests, so make them generous
// outside production rather than disabling the middleware entirely (we still
// want the code path exercised).
const isProd = process.env.NODE_ENV === 'production';
const scale = isProd ? 1 : 20;

const jsonMessage = (message) => ({
  success: false,
  message,
});

/**
 * Key on IP + email so one attacker cannot lock out every user from one IP,
 * and one victim's account cannot be locked out from many IPs.
 * ipKeyGenerator normalises IPv6 addresses to a /56 subnet.
 */
const ipAndEmailKey = (req) => {
  const email = typeof req.body?.email === 'string'
    ? req.body.email.toLowerCase().trim()
    : 'anonymous';
  return `${ipKeyGenerator(req.ip)}:${email}`;
};

const baseOptions = {
  standardHeaders: 'draft-7', // RateLimit-* response headers
  legacyHeaders: false,
};

/** Broad safety net for the whole API. */
const apiLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 1000 * scale,
  message: jsonMessage('Too many requests. Please try again later.'),
});

/** Login / register. Slow enough to make password guessing useless. */
const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10 * scale,
  keyGenerator: ipAndEmailKey,
  skipSuccessfulRequests: true, // only failed attempts count toward the limit
  message: jsonMessage(
    'Too many login attempts. Please try again in 15 minutes.'
  ),
});

/** Requesting a reset code - each one sends a real email. */
const passwordResetRequestLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5 * scale,
  keyGenerator: ipAndEmailKey,
  message: jsonMessage(
    'Too many password reset requests. Please try again in an hour.'
  ),
});

/**
 * Submitting a reset code. This is the network-level cap; PasswordResetToken
 * also enforces a per-token attempt counter so the code dies after 5 tries
 * even if the attacker rotates IP addresses.
 */
const passwordResetVerifyLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10 * scale,
  keyGenerator: ipAndEmailKey,
  message: jsonMessage(
    'Too many verification attempts. Please request a new code.'
  ),
});

/** Unauthenticated public form -> spam target. */
const contactLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5 * scale,
  message: jsonMessage(
    'Too many messages sent. Please try again later.'
  ),
});

/** Cloudinary uploads cost money and CPU. */
const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 50 * scale,
  message: jsonMessage('Too many uploads. Please try again later.'),
});

/** Anonymous write endpoints (e.g. marking a review helpful). */
const publicWriteLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 30 * scale,
  message: jsonMessage('Too many requests. Please slow down.'),
});

module.exports = {
  apiLimiter,
  authLimiter,
  passwordResetRequestLimiter,
  passwordResetVerifyLimiter,
  contactLimiter,
  uploadLimiter,
  publicWriteLimiter,
};

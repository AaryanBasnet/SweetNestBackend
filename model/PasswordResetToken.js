/**
 * Password Reset Token
 *
 * Security notes:
 *  - The code is generated with crypto.randomInt, not Math.random. Math.random
 *    is not cryptographically secure and its output is predictable from prior
 *    values, which would let an attacker guess reset codes.
 *  - Only an HMAC of the code is stored. A plain SHA-256 of a 6-digit code is
 *    trivially reversible (only 900k candidates), so the digest is keyed with a
 *    server-side secret: anyone who reads the database still cannot recover or
 *    verify a code without the application secret.
 *  - Each token allows a limited number of wrong guesses before it is burned,
 *    so the code cannot be brute forced even if an attacker rotates IPs to
 *    evade the rate limiter.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const TTL_SECONDS = 10 * 60;

const getCodeSecret = () => {
  const secret = process.env.RESET_CODE_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'RESET_CODE_SECRET or JWT_SECRET must be set to hash password reset codes'
    );
  }
  return secret;
};

const hashCode = (code) =>
  crypto
    .createHmac('sha256', getCodeSecret())
    .update(String(code))
    .digest('hex');

const passwordResetTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  // HMAC of the emailed code - the plaintext code is never persisted.
  codeHash: {
    type: String,
    required: true,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + TTL_SECONDS * 1000),
  },
  verified: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: TTL_SECONDS, // TTL index - Mongo deletes the document automatically
  },
});

/** Cryptographically secure 6-digit code. */
passwordResetTokenSchema.statics.generateCode = function () {
  const min = 10 ** (CODE_LENGTH - 1);
  const max = 10 ** CODE_LENGTH;
  return String(crypto.randomInt(min, max));
};

passwordResetTokenSchema.statics.hashCode = hashCode;
passwordResetTokenSchema.statics.MAX_ATTEMPTS = MAX_ATTEMPTS;

/**
 * Constant-time comparison of a submitted code against the stored HMAC.
 * Using === here would leak information through response timing.
 */
passwordResetTokenSchema.methods.matchesCode = function (code) {
  if (typeof code !== 'string' && typeof code !== 'number') return false;

  const submitted = Buffer.from(hashCode(code), 'hex');
  const stored = Buffer.from(this.codeHash, 'hex');

  if (submitted.length !== stored.length) return false;
  return crypto.timingSafeEqual(submitted, stored);
};

passwordResetTokenSchema.methods.isExpired = function () {
  return this.expiresAt < new Date();
};

/**
 * Record a failed guess. Returns true when the token is now exhausted, in
 * which case the caller should delete it and force a fresh request.
 */
passwordResetTokenSchema.methods.registerFailedAttempt = async function () {
  this.attempts += 1;
  await this.save();
  return this.attempts >= MAX_ATTEMPTS;
};

const PasswordResetToken = mongoose.model(
  'PasswordResetToken',
  passwordResetTokenSchema
);

module.exports = PasswordResetToken;

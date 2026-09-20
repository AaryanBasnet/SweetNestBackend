const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../model/User'); 

// Protect routes (logged-in users only)
const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    res.status(401);
    // Distinguish expiry from tampering so the client can tell "log in again"
    // apart from "something is wrong", without leaking crypto details.
    throw new Error(
      error.name === 'TokenExpiredError'
        ? 'Session expired, please log in again'
        : 'Not authorized, token failed'
    );
  }

  // NOTE: no try/catch around the lookup. Wrapping it, as the previous version
  // did, swallowed genuine database errors and reported them as 401s.
  const user = await User.findById(decoded.id);

  if (!user) {
    res.status(401);
    throw new Error('Not authorized, token failed');
  }

  // Revocation for stateless JWTs: a password change invalidates every token
  // issued before it, so resetting a password really does kick attackers out.
  if (user.changedPasswordAfter(decoded.iat)) {
    res.status(401);
    throw new Error('Password was changed recently, please log in again');
  }

  req.user = user;
  next();
});

// Admin-only middleware
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403);
    throw new Error('Not authorized as admin');
  }
};

module.exports = { protect, admin };

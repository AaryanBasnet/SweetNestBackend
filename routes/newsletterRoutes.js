/**
 * Newsletter Routes
 */

const express = require('express');
const router = express.Router();

const { subscribe } = require('../controller/newsletterController');
const { newsletterLimiter } = require('../middleware/rateLimitMiddleware');
const { validate } = require('../middleware/validateMiddleware');
const { subscribeSchema } = require('../validators/newsletterValidators');

// Public and unauthenticated, and each call can trigger an email from Brevo,
// so it is rate limited like the contact form.
router.post('/subscribe', newsletterLimiter, validate(subscribeSchema), subscribe);

module.exports = router;

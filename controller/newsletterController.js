/**
 * Newsletter Controller
 */

const asyncHandler = require("express-async-handler");
const newsletterService = require("../services/newsletterService");

const MESSAGES = {
  subscribed: "Thanks for subscribing! Watch your inbox for something sweet.",
  pending_confirmation:
    "Almost there! Check your inbox and confirm your subscription.",
};

// @desc    Subscribe an email address to the newsletter
// @route   POST /api/newsletter/subscribe
// @access  Public
const subscribe = asyncHandler(async (req, res) => {
  const { email, website } = req.body;

  // `website` is a honeypot: hidden from people, filled in by bots. Pretend
  // it worked so the bot learns nothing, but never contact Brevo.
  if (website) {
    return res.status(200).json({ success: true, message: MESSAGES.subscribed });
  }

  const { status } = await newsletterService.subscribe(email);

  // The same answer whether or not the address was already on the list, so
  // the form cannot be used to find out who subscribes.
  res.status(200).json({ success: true, message: MESSAGES[status] });
});

module.exports = { subscribe };

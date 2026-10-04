/**
 * Demo accounts
 *
 * Two public accounts that let anyone (a recruiter, a reviewer) try the shop
 * and the admin dashboard in one click, without registering. They are only
 * created and usable when DEMO_ACCOUNTS_ENABLED=true.
 *
 * Because they are public, both are fenced in (see middleware/demoGuard.js):
 *  - the demo admin can look at everything but change nothing;
 *  - the demo customer can shop and check out (eSewa sandbox), but cannot
 *    change the account, reset its password, or post public reviews.
 *
 * The addresses use example.com, a domain reserved for documentation, so no
 * email sent to them can ever reach a real person.
 */

const DEMO_ACCOUNTS = {
  customer: {
    name: "Demo Customer",
    email: "demo.customer@example.com",
    role: "user",
  },
  admin: {
    name: "Demo Admin",
    email: "demo.admin@example.com",
    role: "admin",
  },
};

const isDemoEnabled = () => process.env.DEMO_ACCOUNTS_ENABLED === "true";

// Showcase customers (scripts/seedShowcase.js) live on this reserved domain.
// The demo admin may only see these customers and the demo accounts
// themselves - never real ones (see services/demoScope.js).
const SAMPLE_EMAIL_DOMAIN = "sample.example.com";
const SAMPLE_EMAIL_PATTERN = /@sample\.example\.com$/;

module.exports = {
  DEMO_ACCOUNTS,
  isDemoEnabled,
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_EMAIL_PATTERN,
};

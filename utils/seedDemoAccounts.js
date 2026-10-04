/**
 * Seed Demo Accounts
 *
 * Makes sure the two demo accounts exist when demo mode is on. Safe to run on
 * every start: existing accounts are left alone apart from re-asserting that
 * they are demo accounts with the right role.
 */

const crypto = require("crypto");
const User = require("../model/User");
const logger = require("../config/logger");
const { DEMO_ACCOUNTS, isDemoEnabled } = require("../config/demoAccounts");

/**
 * Nobody types this password - demo sign-in goes through /api/users/demo-login.
 * It only has to satisfy the model's strength rule and be unguessable.
 */
const randomPassword = () => `Demo!${crypto.randomBytes(18).toString("hex")}`;

const seedDemoAccounts = async () => {
  if (!isDemoEnabled()) return;

  for (const account of Object.values(DEMO_ACCOUNTS)) {
    const existing = await User.findOne({ email: account.email });

    if (existing) {
      if (!existing.isDemo || existing.role !== account.role) {
        existing.isDemo = true;
        existing.role = account.role;
        await existing.save();
      }
      continue;
    }

    await User.create({
      ...account,
      password: randomPassword(),
      isDemo: true,
      isVerified: true,
    });
    logger.info({ role: account.role }, "Created demo account");
  }
};

module.exports = seedDemoAccounts;

/**
 * Demo account guards. See config/demoAccounts.js for why they exist.
 * Both must run after `protect`, which sets req.user.
 */

const { AppError } = require("../utils/AppError");

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The demo admin may read every admin screen but change nothing. */
const blockDemoAdminWrites = (req, res, next) => {
  if (req.user?.isDemo && !READ_METHODS.has(req.method)) {
    return next(
      new AppError(
        "This is a read-only demo admin account, so changes are turned off.",
        403
      )
    );
  }
  next();
};

/** Blocks a demo account from an action entirely, e.g. editing the profile. */
const blockDemo = (action) => (req, res, next) => {
  if (req.user?.isDemo) {
    return next(
      new AppError(`Demo accounts can't ${action}. Create a free account to try it.`, 403)
    );
  }
  next();
};

module.exports = { blockDemoAdminWrites, blockDemo };

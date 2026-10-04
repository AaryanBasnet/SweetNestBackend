/**
 * What the public demo admin is allowed to see.
 *
 * The demo admin can open every admin screen, and anyone on the internet can
 * sign in as it. Read-only is not enough on its own: it must also never see
 * real customers' names, emails, addresses, orders or messages. So every
 * admin read narrows its query with the scope returned here.
 *
 * For a demo account the scope covers only the showcase customers
 * (SAMPLE_EMAIL_PATTERN) and the demo accounts themselves. For everyone else
 * it is empty, so real admins see everything exactly as before.
 *
 * Usage, in any admin read:
 *     const scope = await getDemoScope(req);
 *     Order.find({ ...filter, ...scope.orders })
 */

const User = require("../model/User");
const { SAMPLE_EMAIL_PATTERN } = require("../config/demoAccounts");

const UNSCOPED = Object.freeze({
  isScoped: false,
  userIds: null,
  users: {},
  orders: {},
  reviews: {},
  contacts: {},
});

const getDemoScope = async (req) => {
  if (!req.user?.isDemo) return UNSCOPED;
  if (req.demoScope) return req.demoScope; // once per request

  const userIds = await User.find({
    $or: [{ email: SAMPLE_EMAIL_PATTERN }, { isDemo: true }],
  }).distinct("_id");

  req.demoScope = {
    isScoped: true,
    userIds,
    users: { _id: { $in: userIds } },
    orders: { user: { $in: userIds } },
    reviews: { user: { $in: userIds } },
    // Contact messages come from real visitors; none are sample data.
    contacts: { email: SAMPLE_EMAIL_PATTERN },
  };
  return req.demoScope;
};

/** Whether a request with this scope may see records owned by `userId`. */
const canSeeUser = (scope, userId) =>
  !scope.isScoped ||
  Boolean(userId && scope.userIds.some((id) => id.equals(userId._id || userId)));

module.exports = { getDemoScope, canSeeUser };

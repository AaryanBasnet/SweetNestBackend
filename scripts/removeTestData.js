/**
 * Remove one person's test data (orders, reviews, cart and so on) so the
 * production database holds only the showcase data and the demo accounts.
 *
 * Safe by default: it only PRINTS what it would remove. Nothing is deleted
 * until you add --confirm.
 *
 * It never touches showcase customers (sample.example.com) or the demo
 * accounts, and it keeps the account itself unless you ask for it.
 *
 * USAGE:
 *   node scripts/removeTestData.js --email you@example.com                  # preview
 *   node scripts/removeTestData.js --email you@example.com --confirm        # delete orders, reviews, cart, notifications, wishlist
 *   node scripts/removeTestData.js --email you@example.com --order SN-1234 --confirm   # delete only that order
 *   node scripts/removeTestData.js --email you@example.com --delete-account --confirm   # also delete the account
 *   --include-admin    needed to delete an account whose role is admin
 *
 * Needs DB_URL in the environment, like the other scripts.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../model/User');
const Order = require('../model/Order');
const Review = require('../model/Review');
const Cart = require('../model/Cart');
const Notification = require('../model/Notification');
const Wishlist = require('../model/Wishlist');
const { SAMPLE_EMAIL_PATTERN } = require('../config/demoAccounts');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const run = async () => {
  const email = (option('--email') || '').trim().toLowerCase();
  const orderNumber = option('--order');
  const confirm = flag('--confirm');
  const deleteAccount = flag('--delete-account');

  if (!email) fail('Pass --email <address>. See the usage notes at the top of this file.');
  if (orderNumber && deleteAccount) fail('--order and --delete-account cannot be combined.');
  if (!process.env.DB_URL) fail('DB_URL is not set.');

  await mongoose.connect(process.env.DB_URL);

  const user = await User.findOne({ email }).select('name email role isDemo');
  if (!user) fail(`No account with the email ${email}.`);
  if (user.isDemo || SAMPLE_EMAIL_PATTERN.test(user.email)) {
    fail('Refusing: that is a demo or showcase account, which the seed scripts manage.');
  }
  if (deleteAccount && user.role === 'admin' && !flag('--include-admin')) {
    fail('Refusing to delete an admin account without --include-admin.');
  }

  const orderFilter = { user: user._id, ...(orderNumber && { orderNumber }) };
  const orders = await Order.find(orderFilter).select('orderNumber total orderStatus createdAt');
  if (orderNumber && orders.length === 0) fail(`${user.email} has no order ${orderNumber}.`);

  const reviews = orderNumber ? [] : await Review.find({ user: user._id }).select('_id');
  const extras = orderNumber
    ? {}
    : {
        carts: await Cart.countDocuments({ user: user._id }),
        notifications: await Notification.countDocuments({ user: user._id }),
        wishlists: await Wishlist.countDocuments({ user: user._id }),
      };

  console.log(`\nAccount: ${user.name} <${user.email}> (${user.role})`);
  console.log(`Orders to remove (${orders.length}):`);
  orders.forEach((o) =>
    console.log(`  ${o.orderNumber}  Rs ${o.total}  ${o.orderStatus}  ${o.createdAt.toISOString().slice(0, 10)}`)
  );
  if (!orderNumber) {
    console.log(`Reviews: ${reviews.length}`);
    Object.entries(extras).forEach(([name, count]) => console.log(`${name}: ${count}`));
  }
  console.log(`Account itself: ${deleteAccount ? 'WILL BE DELETED' : 'kept'}`);

  if (!confirm) {
    console.log('\nPreview only. Nothing was deleted. Add --confirm to delete.');
    return;
  }

  const removedOrders = await Order.deleteMany(orderFilter);
  console.log(`\nDeleted ${removedOrders.deletedCount} orders.`);

  if (!orderNumber) {
    // One at a time so the review model's hook recalculates each cake's rating.
    for (const review of reviews) await Review.findOneAndDelete({ _id: review._id });
    await Cart.deleteMany({ user: user._id });
    await Notification.deleteMany({ user: user._id });
    await Wishlist.deleteMany({ user: user._id });
    console.log(`Deleted ${reviews.length} reviews, plus cart, notifications and wishlist.`);
  }

  if (deleteAccount) {
    await User.deleteOne({ _id: user._id });
    console.log('Deleted the account.');
  }
};

run()
  .catch((err) => fail(err.stack || err.message))
  .finally(() => mongoose.disconnect());

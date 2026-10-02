/**
 * Creates the test shoppers the k6 journey logs in as.
 *
 * k6 cannot touch the database, and registration needs email verification,
 * so users are created here directly (same approach as
 * scripts/load-test-order-creation.js). Emails are k6user<N>@seedmail.dev so
 * they can be wiped by domain without touching real data.
 *
 * USAGE:
 *   node scripts/k6/seed-k6-users.js              # create 100 users
 *   node scripts/k6/seed-k6-users.js --count=200
 *   node scripts/k6/seed-k6-users.js --cleanup    # remove users, carts, orders
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../../model/User');
const Cart = require('../../model/Cart');
const Order = require('../../model/Order');

const EMAIL_DOMAIN = 'seedmail.dev';
const EMAIL_PREFIX = 'k6user';
const PASSWORD = 'K6LoadTest123!';

const args = process.argv.slice(2);
const count = Number((args.find((a) => a.startsWith('--count=')) || '').split('=')[1] || 100);
const cleanupOnly = args.includes('--cleanup');

async function wipe() {
  const users = await User.find({ email: new RegExp(`^${EMAIL_PREFIX}\\d+@${EMAIL_DOMAIN}$`) });
  const ids = users.map((u) => u._id);
  if (ids.length === 0) return 0;
  await Promise.all([
    Order.deleteMany({ user: { $in: ids } }),
    Cart.deleteMany({ user: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } }),
  ]);
  return ids.length;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run: NODE_ENV=production.');
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_URL);
  const removed = await wipe();
  if (removed) console.log(`Removed ${removed} previous k6 users.`);

  if (!cleanupOnly) {
    for (let i = 1; i <= count; i++) {
      await User.create({
        name: `K6 User ${i}`,
        email: `${EMAIL_PREFIX}${i}@${EMAIL_DOMAIN}`,
        password: PASSWORD,
        role: 'user',
        isVerified: true,
      });
    }
    console.log(`Created ${count} users: ${EMAIL_PREFIX}1..${count}@${EMAIL_DOMAIN}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('k6 user seed failed:', err);
  process.exit(1);
});

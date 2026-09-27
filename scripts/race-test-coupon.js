/**
 * Race condition test — coupon double-discount check.
 *
 * Fires N simultaneous checkout requests from the SAME user, using the SAME
 * cart and SAME coupon, and reports what actually happened afterward.
 *
 * This is not a load test (that's autocannon's job) — it's a correctness
 * test. We're checking whether concurrent requests can each get a discount
 * that was only supposed to be usable once, not how fast the server is.
 *
 * USAGE:
 *   node scripts/race-test-coupon.js
 *   node scripts/race-test-coupon.js --concurrency=20
 *   node scripts/race-test-coupon.js --cleanup   (delete test data after)
 *
 * Requires the server to be running locally (npm run dev) in a separate
 * terminal — this script talks to it over HTTP, like a real client would.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const User = require('../model/User');
const Cake = require('../model/Cake');
const Cart = require('../model/Cart');
const Coupon = require('../model/Coupon');
const Order = require('../model/Order');

const BASE_URL = process.env.RACE_TEST_BASE_URL || 'http://localhost:5000';
const TEST_EMAIL = 'race-test-runner@seedmail.dev';
const TEST_PASSWORD = 'RaceTest123!';

const args = process.argv.slice(2);
const concurrency = Number(
  (args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 10
);
const shouldCleanup = args.includes('--cleanup');

function tomorrowPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d;
}

async function setup() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run race test: NODE_ENV=production.');
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_URL);
  console.log('Connected to DB.\n');

  // Clean slate: remove any leftovers from a previous run of this script.
  const existingUser = await User.findOne({ email: TEST_EMAIL });
  if (existingUser) {
    await Promise.all([
      Order.deleteMany({ user: existingUser._id }),
      Cart.deleteMany({ user: existingUser._id }),
      Coupon.deleteMany({ user: existingUser._id }),
      User.deleteOne({ _id: existingUser._id }),
    ]);
  }

  // Real user, real password — goes through the pre('save') hash hook
  // because we use .create(), not insertMany.
  const user = await User.create({
    name: 'Race Test Runner',
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    role: 'user',
    isVerified: true,
  });

  const cake = await Cake.findOne({ isActive: true });
  if (!cake) throw new Error('No cake found — run the main seed script first.');

  const weight = cake.weightOptions[0];

  const coupon = await Coupon.create({
    user: user._id,
    discountType: 'percentage',
    discountValue: 20,
    maxDiscount: 200,
    minOrderAmount: 0,
    rewardTier: { name: 'Race Test Tier', pointsCost: 0 },
    isUsed: false,
    expiresAt: tomorrowPlus(30),
  });

  await Cart.create({
    user: user._id,
    items: [
      {
        cake: cake._id,
        quantity: 1,
        selectedWeight: {
          weightInKg: weight.weightInKg,
          label: weight.label,
          price: weight.price,
        },
      },
    ],
    deliveryType: 'delivery',
    promoCode: {
      code: coupon.code,
      discount: coupon.discountValue,
      discountType: coupon.discountType,
      maxDiscount: coupon.maxDiscount,
      couponId: coupon._id,
    },
  });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  console.log(`Test user: ${TEST_EMAIL}`);
  console.log(`Cake: ${cake.name} (${weight.label}, Rs ${weight.price})`);
  console.log(`Coupon: ${coupon.code} (20% off, capped at Rs ${coupon.maxDiscount})\n`);

  return { user, coupon, token };
}

function buildOrderPayload() {
  return {
    contactEmail: TEST_EMAIL,
    shippingAddress: {
      firstName: 'Race',
      lastName: 'Tester',
      address: '123 Concurrency Lane',
      city: 'Kathmandu',
      postalCode: '44600',
      phone: '9800000000',
    },
    deliverySchedule: {
      date: tomorrowPlus(3).toISOString(),
      timeSlot: '09:00 AM - 12:00 PM',
    },
    paymentMethod: 'cod',
  };
}

async function fireConcurrentCheckouts(token, n) {
  console.log(`Firing ${n} simultaneous checkout requests...\n`);

  const requests = Array.from({ length: n }, () =>
    fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildOrderPayload()),
    }).then(async (res) => ({ status: res.status, body: await res.json() }))
      .catch((err) => ({ status: 'ERROR', body: { message: err.message } }))
  );

  return Promise.all(requests);
}

async function report(userId, couponId) {
  const orders = await Order.find({ user: userId }).sort({ createdAt: 1 });
  const discountedOrders = orders.filter((o) => o.discount > 0);
  const totalDiscountGiven = discountedOrders.reduce((sum, o) => sum + o.discount, 0);
  const coupon = await Coupon.findById(couponId);

  console.log('─'.repeat(60));
  console.log('RESULTS');
  console.log('─'.repeat(60));
  console.log(`Orders created:            ${orders.length}`);
  console.log(`Orders carrying a discount: ${discountedOrders.length}`);
  console.log(`Total discount given out:  Rs ${totalDiscountGiven}`);
  console.log(`Coupon isUsed:             ${coupon.isUsed}`);
  console.log(`Coupon usedInOrder:        ${coupon.usedInOrder || '(none)'}`);
  console.log('');

  if (discountedOrders.length > 1) {
    console.log('FINDING: Multiple orders received the discount from a single');
    console.log('coupon. consumeCoupon() correctly prevented the COUPON RECORD');
    console.log('from being reused, but the discount was already baked into');
    console.log('each order at creation time, before the consume step ran.');
  } else if (discountedOrders.length === 1) {
    console.log('No double-discount observed this run. Note: this does not');
    console.log('prove the race is impossible — timing-dependent races can');
    console.log('pass on some runs. Consider running multiple times.');
  } else {
    console.log('No orders carried a discount — check the test setup (coupon');
    console.log('minOrderAmount vs cart total, cart contents, etc).');
  }
  console.log('─'.repeat(60));

  return { orders, discountedOrders, totalDiscountGiven, coupon };
}

async function cleanup(userId, couponId) {
  console.log('\nCleaning up test data...');
  await Promise.all([
    Order.deleteMany({ user: userId }),
    Cart.deleteMany({ user: userId }),
    Coupon.deleteOne({ _id: couponId }),
    User.deleteOne({ _id: userId }),
  ]);
  console.log('Done.');
}

async function main() {
  const { user, coupon, token } = await setup();

  const results = await fireConcurrentCheckouts(token, concurrency);

  const succeeded = results.filter((r) => r.status === 201).length;
  const failed = results.length - succeeded;
  console.log(`HTTP results: ${succeeded} succeeded (201), ${failed} did not.\n`);

  if (failed > 0) {
    console.log('Non-201 responses (first 3 shown):');
    results
      .filter((r) => r.status !== 201)
      .slice(0, 3)
      .forEach((r) => console.log(`  [${r.status}]`, r.body?.message || r.body));
    console.log('');
  }

  await report(user._id, coupon._id);

  if (shouldCleanup) {
    await cleanup(user._id, coupon._id);
  } else {
    console.log('\n(Test data left in DB for inspection. Re-run with --cleanup to remove it,');
    console.log('or just re-run this script again — it wipes its own previous run first.)');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Race test failed:', err);
  process.exit(1);
});
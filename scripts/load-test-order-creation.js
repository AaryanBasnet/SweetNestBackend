/**
 * Load test — order creation throughput under real concurrency.
 *
 * Why not just autocannon: POST /api/orders is protected by a checkout lock
 * (one in-flight checkout per cart at a time, by design — see
 * services/orderService.js, claimCartForCheckout). Hitting that endpoint
 * with many connections sharing ONE user/cart would mostly measure lock
 * rejections, not real throughput. This script creates N separate test
 * users, each with their own cart, so N concurrent requests never compete
 * for the same lock.
 *
 * paymentMethod is 'esewa' deliberately: unlike 'cod', it does not clear the
 * cart after a successful order, so each user's cart can be reused for
 * repeated orders across the whole test duration instead of needing a fresh
 * cart per request. No real eSewa API call happens at order-creation time —
 * payment completion is a separate step this script never touches.
 *
 * MEASUREMENT CAVEAT (read before quoting these numbers anywhere): this
 * measures N-way CONCURRENT throughput of the order-creation code path
 * (pricing calculation, Order.create, lock claim/release) — it is not N
 * unique one-time customers, since each lane reuses its own cart
 * repeatedly. That's a reasonable way to measure the endpoint's real
 * processing cost under concurrency, but it is not a simulation of N
 * distinct real shoppers checking out once each.
 *
 * USAGE:
 *   node scripts/load-test-order-creation.js
 *   node scripts/load-test-order-creation.js --lanes=20 --duration=15
 *   node scripts/load-test-order-creation.js --cleanup
 */

require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const User = require('../model/User');
const Cake = require('../model/Cake');
const Cart = require('../model/Cart');
const Order = require('../model/Order');

const BASE_URL = process.env.RACE_TEST_BASE_URL || 'http://localhost:5000';
const EMAIL_DOMAIN = 'loadtest-order@seedmail.dev';
const TEST_PASSWORD = 'LoadTest123!';

const args = process.argv.slice(2);
const lanes = Number((args.find((a) => a.startsWith('--lanes=')) || '').split('=')[1] || 20);
const durationSec = Number(
  (args.find((a) => a.startsWith('--duration=')) || '').split('=')[1] || 15
);
const shouldCleanup = args.includes('--cleanup');

function tomorrowPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d;
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(idx, sortedArr.length - 1))];
}

async function wipePreviousRun() {
  // Matches every lane's email, e.g. "lane0_loadtest-order@seedmail.dev",
  // by domain — all of them end in "@seedmail.dev".
  const users = await User.find({ email: { $regex: `@${EMAIL_DOMAIN.split('@')[1]}$` } });
  const ids = users.map((u) => u._id);
  if (ids.length === 0) return;

  await Promise.all([
    Order.deleteMany({ user: { $in: ids } }),
    Cart.deleteMany({ user: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } }),
  ]);
}

async function setupLanes(n) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run load test: NODE_ENV=production.');
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_URL);
  console.log('Connected to DB.\n');

  await wipePreviousRun();

  const cake = await Cake.findOne({ isActive: true });
  if (!cake) throw new Error('No cake found — run the main seed script first.');
  const weight = cake.weightOptions[0];

  console.log(`Setting up ${n} test users, each with their own cart...`);

  const lanesData = [];
  for (let i = 0; i < n; i++) {
    const email = `lane${i}_${EMAIL_DOMAIN}`;
    const user = await User.create({
      name: `Load Test Lane ${i}`,
      email,
      password: TEST_PASSWORD,
      role: 'user',
      isVerified: true,
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
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    lanesData.push({ userId: user._id, token });
  }

  console.log(`Done. Cake: ${cake.name} (${weight.label}, Rs ${weight.price})\n`);
  return lanesData;
}

function buildOrderPayload() {
  return {
    contactEmail: 'loadtest@example.com',
    shippingAddress: {
      firstName: 'Load',
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
    paymentMethod: 'esewa', // does not clear the cart — see file header
  };
}

async function runLane(lane, deadline, results) {
  while (Date.now() < deadline) {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lane.token}`,
        },
        body: JSON.stringify(buildOrderPayload()),
      });
      const latency = Date.now() - start;
      results.push({ status: res.status, latency });
    } catch (err) {
      results.push({ status: 'ERROR', latency: Date.now() - start, error: err.message });
    }
  }
}

async function main() {
  const lanesData = await setupLanes(lanes);

  console.log(`Running ${lanes} concurrent lanes for ${durationSec}s...\n`);

  const results = [];
  const deadline = Date.now() + durationSec * 1000;

  await Promise.all(lanesData.map((lane) => runLane(lane, deadline, results)));

  const succeeded = results.filter((r) => r.status === 201);
  const failed = results.filter((r) => r.status !== 201);
  const latencies = succeeded.map((r) => r.latency).sort((a, b) => a - b);

  console.log('─'.repeat(60));
  console.log('RESULTS');
  console.log('─'.repeat(60));
  console.log(`Total requests:       ${results.length}`);
  console.log(`Succeeded (201):      ${succeeded.length}`);
  console.log(`Failed:               ${failed.length}`);
  console.log(`Effective req/sec:    ${(succeeded.length / durationSec).toFixed(1)}`);
  console.log('');
  if (latencies.length > 0) {
    console.log('Latency (successful requests only):');
    console.log(`  min:    ${latencies[0]} ms`);
    console.log(`  median: ${percentile(latencies, 50)} ms`);
    console.log(`  p95:    ${percentile(latencies, 95)} ms`);
    console.log(`  p99:    ${percentile(latencies, 99)} ms`);
    console.log(`  max:    ${latencies[latencies.length - 1]} ms`);
  }

  if (failed.length > 0) {
    const byStatus = {};
    failed.forEach((r) => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });
    console.log('\nFailures by status:', byStatus);
  }
  console.log('─'.repeat(60));

  if (shouldCleanup) {
    console.log('\nCleaning up test data...');
    await wipePreviousRun();
    console.log('Done.');
  } else {
    console.log('\n(Test data left in DB. Re-run with --cleanup to remove it, or');
    console.log('just re-run this script again — it wipes its own previous run first.)');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
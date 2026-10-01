/**
 * Race condition test — cart add-item check.
 *
 * Fires N simultaneous "add this cake, quantity 1" requests from the SAME
 * user for the SAME cake+weight, then inspects the cart directly.
 *
 * Correct behavior: one cart line, quantity == N.
 * Two distinct ways this can go wrong under concurrency:
 *   - Lost update: multiple requests read the same starting quantity before
 *     any of them writes, so the final quantity ends up lower than N.
 *   - Duplicate lines: multiple requests each independently conclude "no
 *     existing line yet" and each push their own line, instead of one line
 *     accumulating quantity.
 *
 * USAGE:
 *   node scripts/race-test-cart-quantity.js
 *   node scripts/race-test-cart-quantity.js --concurrency=5
 *   node scripts/race-test-cart-quantity.js --cleanup
 *
 * Requires the server to be running locally (npm run dev).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const User = require('../model/User');
const Cake = require('../model/Cake');
const Cart = require('../model/Cart');

const BASE_URL = process.env.RACE_TEST_BASE_URL || 'http://localhost:5000';
const TEST_EMAIL = 'race-test-cart@seedmail.dev';
const TEST_PASSWORD = 'RaceTest123!';

const args = process.argv.slice(2);
const concurrency = Number(
  (args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 5
);
const shouldCleanup = args.includes('--cleanup');

async function setup() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run race test: NODE_ENV=production.');
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_URL);
  console.log('Connected to DB.\n');

  const existingUser = await User.findOne({ email: TEST_EMAIL });
  if (existingUser) {
    await Cart.deleteMany({ user: existingUser._id });
    await User.deleteOne({ _id: existingUser._id });
  }

  const user = await User.create({
    name: 'Cart Race Test Runner',
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    role: 'user',
    isVerified: true,
  });

  const cake = await Cake.findOne({ isActive: true });
  if (!cake) throw new Error('No cake found — run the main seed script first.');

  const weight = cake.weightOptions[0];

  // Start with a real, empty cart — addItem's getOrCreateCart would make one
  // anyway, but creating it explicitly here keeps the starting state visible.
  await Cart.create({ user: user._id, items: [] });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  console.log(`Test user: ${TEST_EMAIL}`);
  console.log(`Cake: ${cake.name} (${weight.label}, weightInKg: ${weight.weightInKg})\n`);

  return { user, cake, weight, token };
}

async function fireConcurrentAdds(token, cake, weight, n) {
  console.log(`Firing ${n} simultaneous "add 1" requests for the same cake+weight...\n`);

  const requests = Array.from({ length: n }, () =>
    fetch(`${BASE_URL}/api/cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        cakeId: cake._id.toString(),
        quantity: 1,
        selectedWeight: { weightInKg: weight.weightInKg },
      }),
    }).then(async (res) => ({ status: res.status, body: await res.json() }))
      .catch((err) => ({ status: 'ERROR', body: { message: err.message } }))
  );

  return Promise.all(requests);
}

async function report(userId, cakeId, weightInKg, expected) {
  const cart = await Cart.findOne({ user: userId });
  const matchingLines = cart.items.filter(
    (item) =>
      item.cake.toString() === cakeId.toString() &&
      item.selectedWeight.weightInKg === weightInKg
  );

  const totalQuantity = matchingLines.reduce((sum, line) => sum + line.quantity, 0);

  console.log('─'.repeat(60));
  console.log('RESULTS');
  console.log('─'.repeat(60));
  console.log(`Expected total quantity:   ${expected}`);
  console.log(`Actual total quantity:     ${totalQuantity}`);
  console.log(`Number of matching lines:  ${matchingLines.length} (expected: 1)`);
  console.log('');

  if (matchingLines.length > 1) {
    console.log('FINDING: DUPLICATE LINES. Multiple concurrent requests each');
    console.log('concluded no line existed yet and each pushed their own,');
    console.log('instead of one line accumulating quantity.');
  } else if (totalQuantity < expected) {
    console.log('FINDING: LOST UPDATE. Concurrent requests read the same');
    console.log('starting quantity before any of them wrote back — some');
    console.log('additions were silently overwritten instead of accumulating.');
  } else if (totalQuantity === expected && matchingLines.length === 1) {
    console.log('No race condition observed this run. Note: this does not');
    console.log('prove it is impossible — timing-dependent races can pass');
    console.log('on some runs. Consider running multiple times.');
  } else {
    console.log('Unexpected state — inspect manually.');
  }
  console.log('─'.repeat(60));

  return { cart, matchingLines, totalQuantity };
}

async function cleanup(userId) {
  console.log('\nCleaning up test data...');
  await Cart.deleteMany({ user: userId });
  await User.deleteOne({ _id: userId });
  console.log('Done.');
}

async function main() {
  const { user, cake, weight, token } = await setup();

  const results = await fireConcurrentAdds(token, cake, weight, concurrency);

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

  await report(user._id, cake._id, weight.weightInKg, concurrency);

  if (shouldCleanup) {
    await cleanup(user._id);
  } else {
    console.log('\n(Test data left in DB. Re-run with --cleanup to remove it, or');
    console.log('just re-run this script again — it wipes its own previous run first.)');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Race test failed:', err);
  process.exit(1);
});
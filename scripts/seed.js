/**
 * Seed script — generates realistic-volume test data for local load testing.
 *
 * NOT for production. Writes directly to MongoDB via your Mongoose models,
 * bypassing your Express routes/controllers — so Cloudinary, eSewa, and
 * email are never touched. This is purely a database volume simulation,
 * the same principle as using k6/autocannon to simulate traffic: we're not
 * claiming these are real customers, we're generating enough data to
 * observe how your queries behave at realistic scale.
 *
 * USAGE:
 *   npm install --save-dev @faker-js/faker
 *   node scripts/seed.js              # seed data (additive)
 *   node scripts/seed.js --wipe       # wipe previously seeded data, then seed fresh
 *   node scripts/seed.js --wipe-only  # wipe previously seeded data and stop - no reseed
 *
 * Place this file in your backend project's `scripts/` folder (adjust the
 * require paths below if your model folder is named differently).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');

const Category = require('../model/Category');
const Cake = require('../model/Cake');
const User = require('../model/User');
const Order = require('../model/Order');
const Review = require('../model/Review');
const Cart = require('../model/Cart');

const CONFIG = {
  categories: 8,
  users: 500,
  cakes: 5000,
  orders: 50000,
  reviews: 20000,
  batchSize: 1000,
};

// Fixed placeholder hash so schema validation passes (it just checks the
// $2a$/$2b$ prefix) without paying bcrypt's real hashing cost 500 times.
// These are seed accounts for load testing only — not meant to be logged
// into with a real password.
const DUMMY_PASSWORD_HASH = '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV1234567';

const crypto = require('crypto');

// insertMany() skips document middleware (pre('save') hooks), so the Cake
// model's own slug-generation hook never runs. Without a slug, every cake
// after the first collides on the unique slug index and gets silently
// dropped. We replicate the same slug format here, manually, per document.
function generateSlug(name, index) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-{2,}/g, '-');
  const uniqueSuffix = crypto.randomBytes(4).toString('hex');
  return `${base}-${uniqueSuffix}-${index}`;
}

const CATEGORY_NAMES = [
  'Birthday Cakes', 'Wedding Cakes', 'Cupcakes', 'Macarons',
  'Custom Orders', 'Anniversary Cakes', 'Cheesecakes', 'Vegan Cakes',
];

const FLAVOR_TAGS = ['Chocolate', 'Vanilla', 'Fruit', 'Nut', 'Spiced', 'Coffee', 'Caramel', 'Citrus', 'Berry', 'Tropical'];
const BADGES = ['bestSeller', 'organic', 'newArrival', 'limitedEdition', 'sugarFree', 'vegan'];

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertInBatches(Model, docs, label) {
  const batches = chunk(docs, CONFIG.batchSize);
  let inserted = 0;
  for (const batch of batches) {
    const result = await Model.insertMany(batch, { ordered: false }).catch((err) => {
      // ordered:false means a duplicate-key error (e.g. the review unique
      // index) doesn't abort the whole batch — just report what landed.
      if (err.insertedDocs) {
        const failedCount = batch.length - err.insertedDocs.length;
        if (failedCount > 0) {
          console.log(`\n  [${label}] ${failedCount} docs in this batch failed: ${err.message.slice(0, 150)}`);
        }
        return err.insertedDocs;
      }
      throw err;
    });
    inserted += Array.isArray(result) ? result.length : batch.length;
    process.stdout.write(`\r${label}: ${inserted}/${docs.length}`);
  }
  console.log('');
  return inserted;
}

async function wipeSeedData() {
  console.log('Wiping previously seeded data...');
  // Only reviews written by load-test users. This used to be deleteMany({}),
  // which also wiped every real and showcase review in the database.
  const seedUsers = await User.find({ email: /@seedmail\.dev$/ }).select('_id');
  const seedCakes = await Cake.find({ 'images.public_id': /^seed\// }).select('_id');
  await Review.deleteMany({
    $or: [
      { user: { $in: seedUsers.map((u) => u._id) } },
      { cake: { $in: seedCakes.map((c) => c._id) } },
    ],
  });
  await Order.deleteMany({ orderNumber: /^SN-SEED-/ });
  // Carts the load-test users left behind (from the cart/coupon race tests)
  await Cart.deleteMany({ user: { $in: seedUsers.map((u) => u._id) } });
  await Cake.deleteMany({ 'images.public_id': /^seed\// });
  await User.deleteMany({ email: /@seedmail\.dev$/ });
  console.log('Wipe complete.\n');
}

async function seedCategories() {
  const categories = [];
  for (const name of CATEGORY_NAMES) {
    const existing = await Category.findOne({ name });
    if (existing) {
      categories.push(existing);
      continue;
    }
    const cat = await Category.create({
      name,
      description: faker.lorem.sentence(),
      isActive: true,
    });
    categories.push(cat);
  }
  return categories;
}

async function seedUsers() {
  const docs = [];
  for (let i = 0; i < CONFIG.users; i++) {
    docs.push({
      name: faker.person.fullName(),
      email: `seed_${i}_${faker.string.alphanumeric(6)}@seedmail.dev`,
      password: DUMMY_PASSWORD_HASH,
      phone: faker.phone.number(),
      role: 'user',
      isVerified: true,
      sweetPoints: faker.number.int({ min: 0, max: 500 }),
    });
  }
  await insertInBatches(User, docs, 'Users');
  return User.find({ email: /@seedmail\.dev$/ }).select('_id');
}

function randomWeightOptions() {
  const base = faker.number.int({ min: 500, max: 3000 });
  return [
    { weightInKg: 0.5, label: '500g', price: base, isDefault: true },
    { weightInKg: 1, label: '1kg', price: Math.round(base * 1.8) },
    { weightInKg: 2, label: '2kg', price: Math.round(base * 3.4) },
  ];
}

async function seedCakes(categories) {
  const docs = [];
  for (let i = 0; i < CONFIG.cakes; i++) {
    const category = faker.helpers.arrayElement(categories);
    const name = `${faker.commerce.productAdjective()} ${faker.commerce.productMaterial()} Cake ${i}`;
    docs.push({
      name,
      slug: generateSlug(name, i),
      description: faker.lorem.paragraph(),
      category: category._id,
      images: [
        { public_id: `seed/cake_${i}`, url: `https://picsum.photos/seed/cake${i}/600/400` },
      ],
      weightOptions: randomWeightOptions(),
      ingredients: faker.helpers.arrayElements(['Flour', 'Sugar', 'Eggs', 'Butter', 'Cocoa', 'Vanilla extract'], 3),
      flavorTags: faker.helpers.arrayElements(FLAVOR_TAGS, faker.number.int({ min: 1, max: 3 })),
      badges: faker.helpers.arrayElements(BADGES, faker.number.int({ min: 0, max: 2 })),
      isActive: true,
      isFeatured: faker.datatype.boolean({ probability: 0.1 }),
      // ratingsAverage/ratingsCount are recomputed from seeded reviews at the end
    });
  }
  await insertInBatches(Cake, docs, 'Cakes');
  return Cake.find({ 'images.public_id': /^seed\// }).select('_id weightOptions category');
}

function randomDeliveryDate() {
  const daysAhead = faker.number.int({ min: 2, max: 30 });
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date;
}

async function seedOrders(users, cakes) {
  const timeSlots = ['09:00 AM - 12:00 PM', '12:00 PM - 03:00 PM', '03:00 PM - 06:00 PM'];
  const statuses = ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled'];
  const docs = [];

  for (let i = 0; i < CONFIG.orders; i++) {
    const user = faker.helpers.arrayElement(users);
    const itemCount = faker.number.int({ min: 1, max: 3 });
    const items = [];
    let subtotal = 0;

    for (let j = 0; j < itemCount; j++) {
      const cake = faker.helpers.arrayElement(cakes);
      const weight = faker.helpers.arrayElement(cake.weightOptions);
      const quantity = faker.number.int({ min: 1, max: 2 });
      const itemTotal = weight.price * quantity;
      subtotal += itemTotal;
      items.push({
        cake: cake._id,
        name: 'Seeded Cake',
        quantity,
        weight: { weightInKg: weight.weightInKg, label: weight.label, price: weight.price },
        isCustom: false,
        itemTotal,
      });
    }

    const shipping = 100;
    const discount = faker.datatype.boolean({ probability: 0.2 }) ? Math.round(subtotal * 0.1) : 0;
    const total = subtotal + shipping - discount;
    const paymentMethod = faker.helpers.arrayElement(['esewa', 'cod']);
    const orderStatus = faker.helpers.arrayElement(statuses);
    const paymentStatus = orderStatus === 'cancelled'
      ? faker.helpers.arrayElement(['failed', 'refunded', 'pending'])
      : faker.helpers.arrayElement(['paid', 'pending']);

    docs.push({
      orderNumber: `SN-SEED-${String(i).padStart(6, '0')}`,
      user: user._id,
      items,
      shippingAddress: {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        address: faker.location.streetAddress(),
        city: faker.location.city(),
        postalCode: faker.location.zipCode(),
        phone: faker.phone.number(),
      },
      contactEmail: faker.internet.email(),
      deliverySchedule: { date: randomDeliveryDate(), timeSlot: faker.helpers.arrayElement(timeSlots) },
      paymentMethod,
      paymentStatus,
      orderStatus,
      subtotal,
      shipping,
      discount,
      total,
      createdAt: faker.date.past({ years: 1 }),
    });
  }

  await insertInBatches(Order, docs, 'Orders');
}

async function seedReviews(users, cakes) {
  const seenPairs = new Set();
  const docs = [];
  let attempts = 0;

  while (docs.length < CONFIG.reviews && attempts < CONFIG.reviews * 3) {
    attempts++;
    const user = faker.helpers.arrayElement(users);
    const cake = faker.helpers.arrayElement(cakes);
    const key = `${cake._id}_${user._id}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);

    docs.push({
      cake: cake._id,
      user: user._id,
      rating: faker.number.int({ min: 1, max: 5 }),
      comment: faker.lorem.sentences(2),
      reviewerName: faker.person.fullName(),
      isVerifiedPurchase: faker.datatype.boolean({ probability: 0.7 }),
      isApproved: true,
      createdAt: faker.date.past({ years: 1 }),
    });
  }

  await insertInBatches(Review, docs, 'Reviews');
}

async function recomputeCakeRatings() {
  console.log('Recomputing cake ratings from seeded reviews...');
  const stats = await Review.aggregate([
    { $match: { isApproved: true } },
    { $group: { _id: '$cake', avgRating: { $avg: '$rating' }, numRatings: { $sum: 1 } } },
  ]);

  const ops = stats.map((s) => ({
    updateOne: {
      filter: { _id: s._id },
      update: { ratingsAverage: Math.round(s.avgRating * 10) / 10, ratingsCount: s.numRatings },
    },
  }));

  for (const batch of chunk(ops, CONFIG.batchSize)) {
    await Cake.bulkWrite(batch);
  }
  console.log(`Updated ratings on ${ops.length} cakes.`);
}

async function main() {
  // Hard stop: this script generates 50k+ fake orders and 500 fake users.
  // Running it against a real deployed database would be a disaster.
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed script: NODE_ENV=production.');
    process.exit(1);
  }

  const dbUrl = process.env.DB_URL;
  if (!dbUrl) throw new Error('DB_URL not set in .env');

  console.log(`Connecting to ${dbUrl}...`);
  await mongoose.connect(dbUrl);
  console.log('Connected.\n');

  if (process.argv.includes('--wipe') || process.argv.includes('--wipe-only')) {
    await wipeSeedData();
  }

  if (process.argv.includes('--wipe-only')) {
    console.log('Wipe-only: skipping reseed.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const categories = await seedCategories();
  console.log(`Categories ready: ${categories.length}\n`);

  const users = await seedUsers();
  console.log(`Users ready: ${users.length}\n`);

  const cakes = await seedCakes(categories);
  console.log(`Cakes ready: ${cakes.length}\n`);

  await seedOrders(users, cakes);
  await seedReviews(users, cakes);
  await recomputeCakeRatings();

  console.log('\nSeeding complete.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
/**
 * Seed showcase data: sample customers, two months of orders, and reviews.
 *
 * WHY: the live site doubles as a portfolio piece. Without history, the admin
 * dashboard opens on "Rs. 0 revenue, 0 orders", the charts are blank, every
 * cake has zero reviews, and the demo customer's "My Orders" page is empty.
 * That undersells everything behind it. This fills those screens with data
 * that behaves like a real bakery's.
 *
 * NOT the load-test volume in scripts/seed.js. Small, hand-shaped, believable:
 *  - ~25 customers with Nepali names and Kathmandu-valley addresses
 *  - orders spread over the last 60 days, busier on Fridays and Saturdays,
 *    in the state an order of that age would really be in (old ones delivered
 *    or cancelled, today's still pending or being baked)
 *  - mostly eSewa (paid), some cash on delivery (paid only once delivered),
 *    refunds on cancelled eSewa orders, a share of custom-designed cakes
 *  - reviews only from customers whose cake was actually delivered
 *  - the demo customer gets an order history of their own, including one
 *    out for delivery today, so order tracking has something to show
 *
 * Sample customers live on sample.example.com - a reserved domain, so nothing
 * can ever be emailed to a real person. Everything is tied to those accounts
 * (plus the demo customer), which is what makes re-running and wiping safe:
 * real customers and their orders are never touched.
 *
 * Dates are relative to "now", so the dashboard's "last 7 days" stays full
 * only for a while. Re-run it to refresh (it replaces its own previous data).
 *
 * USAGE:
 *   node scripts/seedShowcase.js              # replace previous sample data
 *   node scripts/seedShowcase.js --wipe-only  # remove sample data and stop
 *   NODE_ENV=production also needs --allow-production
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const User = require('../model/User');
const Cake = require('../model/Cake');
const Order = require('../model/Order');
const Review = require('../model/Review');
const { DEMO_ACCOUNTS } = require('../config/demoAccounts');
const { calculatePointsEarned } = require('../config/rewards');

const SAMPLE_DOMAIN = 'sample.example.com';
const DAYS_OF_HISTORY = 60;
const SHIPPING = 100;
const DAY = 24 * 60 * 60 * 1000;

const args = process.argv.slice(2);
const wipeOnly = args.includes('--wipe-only');

// --- Deterministic randomness: the same data on every run ------------------
let seed = 20261004;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
/** Picks from [[value, weight], ...] */
const weighted = (pairs) => {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [value, w] of pairs) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
};

// --- People and places ------------------------------------------------------
const CUSTOMERS = [
  ['Aarav', 'Shrestha'], ['Sita', 'Gurung'], ['Prakash', 'Thapa'], ['Anjali', 'Maharjan'],
  ['Rohan', 'Karki'], ['Pooja', 'Rai'], ['Bikash', 'Tamang'], ['Nisha', 'Adhikari'],
  ['Suraj', 'Bhandari'], ['Kritika', 'Joshi'], ['Aashish', 'Pandey'], ['Manish', 'Lama'],
  ['Riya', 'Shakya'], ['Dipesh', 'Khatri'], ['Sabina', 'Magar'], ['Nabin', 'Poudel'],
  ['Asmita', 'Bajracharya'], ['Sandeep', 'Khadka'], ['Prerana', 'Sharma'], ['Kiran', 'Dahal'],
  ['Elina', 'Pradhan'], ['Rajan', 'Bista'], ['Samjhana', 'Ghimire'], ['Ujjwal', 'Neupane'],
  ['Trishna', 'Malla'],
];

const PLACES = [
  ['Baluwatar Marg', 'Kathmandu'], ['Lazimpat Road', 'Kathmandu'], ['New Baneshwor', 'Kathmandu'],
  ['Maharajgunj Chowk', 'Kathmandu'], ['Chabahil', 'Kathmandu'], ['Kalanki', 'Kathmandu'],
  ['Budhanilkantha', 'Kathmandu'], ['Thamel Marg', 'Kathmandu'], ['Jhamsikhel', 'Lalitpur'],
  ['Kupondole', 'Lalitpur'], ['Pulchowk', 'Lalitpur'], ['Sanepa', 'Lalitpur'],
  ['Suryabinayak', 'Bhaktapur'], ['Thimi', 'Bhaktapur'],
];

const TIME_SLOTS = ['09:00 AM - 12:00 PM', '12:00 PM - 03:00 PM', '03:00 PM - 06:00 PM'];

const SPECIAL_REQUESTS = [
  'Please call before arriving.',
  'Leave it with the guard at the gate.',
  'It is a surprise, please do not ring the bell.',
  'Less sweet frosting if possible.',
  'Please add a candle.',
];

const CAKE_MESSAGES = [
  'Happy Birthday!', 'Happy Anniversary!', 'Congratulations!', 'Happy Birthday Aama',
  'Happy Birthday Dad', 'Best Wishes!', 'Happy 25th!', 'Welcome Home',
];

const CANCEL_REASONS = [
  'Ordered the wrong weight, placed a new order.',
  'Plans changed, the party was postponed.',
  'Need it on a different date.',
];

// --- Custom designs (shape what the 3D designer produces) -----------------
const CUSTOM_DESIGNS = [
  {
    name: 'Custom Heart Cake',
    weight: { weightInKg: 2, label: '2 kg', price: 2200 },
    details: { tiers: 1, size: '2 kg', shape: 'Heart', flavor: 'Strawberry', filling: 'Strawberry Jam', frostingColor: 'Pastel Pink', frostingColorHex: '#F9C5D5', drip: 'Strawberry', topper: 'Fresh Seasonal Fruits, Rainbow Sprinkles', topperPrice: 670, message: 'Happy Birthday!' },
    extra: 820,
  },
  {
    name: 'Custom Chocolate Cake',
    weight: { weightInKg: 1.5, label: '1.5 kg', price: 1700 },
    details: { tiers: 1, size: '1.5 kg', shape: 'Round', flavor: 'Chocolate', filling: 'Chocolate Ganache', frostingColor: 'Classic White', frostingColorHex: '#FFFFFF', drip: 'Dark Chocolate', topper: 'Chocolate Shavings', topperPrice: 250, message: 'Congratulations!' },
    extra: 400,
  },
  {
    name: 'Custom Red Velvet Cake',
    weight: { weightInKg: 3, label: '3 kg', price: 3200 },
    details: { tiers: 2, size: '3 kg', shape: 'Round', flavor: 'Red Velvet', filling: 'Cream Cheese', frostingColor: 'Classic White', frostingColorHex: '#FFFFFF', drip: 'None', topper: 'Edible Flowers', topperPrice: 450, message: 'Happy Anniversary!' },
    extra: 450,
  },
  {
    name: 'Custom Vanilla Cake',
    weight: { weightInKg: 1, label: '1 kg', price: 1200 },
    details: { tiers: 1, size: '1 kg', shape: 'Square', flavor: 'Vanilla', filling: 'Vanilla Cream', frostingColor: 'Baby Blue', frostingColorHex: '#A7C7E7', drip: 'None', topper: 'Birthday Candles', topperPrice: 150, message: 'Happy 1st Birthday' },
    extra: 150,
  },
];

// --- Review copy: specific to each cake, plus general lines ---------------
const CAKE_REVIEWS = {
  'Dark Chocolate Cake': [
    'Rich without being too sweet. The ganache layers are the best part.',
    'Ordered for my brother\'s birthday and it was gone in ten minutes.',
    'Proper dark chocolate flavour, moist sponge. Will order again.',
  ],
  'Strawberry Cheesecake': [
    'Creamy, light and the strawberries tasted fresh. Loved it.',
    'Best cheesecake I have had in Kathmandu. Not too heavy.',
  ],
  'Wild Berry Bliss': [
    'Beautiful to look at and the berries were really fresh.',
    'Light sponge and lots of fruit. Perfect for a summer party.',
  ],
  'Midnight Truffle': [
    'Very intense chocolate, exactly what I wanted. The gold flakes looked lovely.',
    'Small slices go a long way, it is that rich. Everyone loved it.',
  ],
  'Citrus Cloud': [
    'Lovely lemon flavour, light and not too sweet.',
    'Something different from the usual chocolate cakes. Fresh and zesty.',
  ],
  'Classic Vanilla Bean': [
    'Simple and done really well. Soft sponge, you can taste real vanilla.',
    'Kids loved it. Clean, classic flavour.',
  ],
  'Black Forest Delight': [
    'Generous cherries and fresh cream, just like a proper black forest.',
    'Our family\'s go-to cake now. Never disappoints.',
  ],
  'Red Velvet Romance': [
    'Moist and the cream cheese frosting is perfect. Ordered for our anniversary.',
    'Looked stunning and tasted even better.',
  ],
  'Tropical Pineapple Crush': [
    'Fresh pineapple and light cream, a nice change from chocolate.',
    'Reminded me of the pineapple cakes from childhood, but better.',
  ],
};

const GENERAL_REVIEWS = {
  5: [
    'Arrived on time and looked exactly like the picture.',
    'Fresh, beautifully packed and delicious. Highly recommend.',
    'Delivery was right in our time slot and the cake was perfect.',
    'Third time ordering and the quality is always the same. Excellent.',
    'Everyone at the office asked where it was from.',
    'Soft, fresh and not overly sweet. Exactly how a cake should be.',
    'Ordered the morning of and it still arrived in time. Lifesaver.',
    'The message on top was neatly piped and the box kept it perfect.',
  ],
  4: [
    'Tasted great. Delivery came near the end of the slot but well packed.',
    'Really good cake, slightly sweeter than I expected.',
    'Lovely flavour. Would like a slightly bigger 1 kg size, but happy overall.',
    'Very fresh and tasty. Packaging could be a little sturdier.',
    'Good value for the quality. Would order again.',
    'Nice and moist. The decoration was simpler than the photo, but tasty.',
  ],
  3: [
    'Good taste, but the frosting had melted a little by the time it arrived.',
    'Nice cake, though delivery was later than the slot we picked.',
    'Flavour was fine, but a bit dry around the edges this time.',
  ],
};

// ---------------------------------------------------------------------------

const ensureSafeToRun = () => {
  if (process.env.NODE_ENV === 'production' && !args.includes('--allow-production')) {
    console.error(
      'Refusing to run against production without --allow-production.\n' +
      'This adds sample customers and orders, clearly tagged on ' + SAMPLE_DOMAIN + '.'
    );
    process.exit(1);
  }
};

const wipe = async () => {
  const sampleUsers = await User.find({ email: new RegExp(`@${SAMPLE_DOMAIN.replace(/\./g, '\\.')}$`) }).select('_id');
  const sampleIds = sampleUsers.map((u) => u._id);
  const demo = await User.findOne({ email: DEMO_ACCOUNTS.customer.email, isDemo: true }).select('_id');
  const orderOwners = demo ? [...sampleIds, demo._id] : sampleIds;

  const orders = await Order.deleteMany({ user: { $in: orderOwners } });
  const reviews = await Review.deleteMany({ user: { $in: sampleIds } });
  const users = await User.deleteMany({ _id: { $in: sampleIds } });
  if (demo) {
    await User.updateOne({ _id: demo._id }, { $set: { sweetPoints: 0, pointsHistory: [] } });
  }

  console.log(`Removed ${users.deletedCount} sample customers, ${orders.deletedCount} orders, ${reviews.deletedCount} reviews.`);
};

const createCustomers = async () => {
  // Nobody signs in as these customers; the password only has to be unusable.
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  const now = Date.now();

  const docs = CUSTOMERS.map(([first, last], i) => {
    const [street, city] = PLACES[i % PLACES.length];
    const phone = `98${String(41000000 + i * 37919).slice(0, 8)}`;
    return {
      name: `${first} ${last}`,
      email: `${first}.${last}@${SAMPLE_DOMAIN}`.toLowerCase(),
      password: passwordHash,
      phone,
      isVerified: true,
      createdAt: new Date(now - between(DAYS_OF_HISTORY + 5, 150) * DAY),
      addresses: [{
        label: 'Home', firstName: first, lastName: last,
        address: `House ${between(3, 180)}, ${street}`, city, phone, isDefault: true,
      }],
    };
  });

  return User.insertMany(docs);
};

/** How many orders a day gets: busier on Friday and Saturday. */
const ordersForDay = (date) => {
  const day = date.getDay(); // 5 = Friday, 6 = Saturday (the Nepali weekend)
  if (day === 5 || day === 6) return between(2, 5);
  return between(0, 3);
};

const statusForAge = (ageDays) => {
  if (ageDays >= 3) return weighted([['delivered', 92], ['cancelled', 8]]);
  if (ageDays === 2) return weighted([['delivered', 60], ['out_for_delivery', 40]]);
  if (ageDays === 1) return weighted([['processing', 50], ['confirmed', 50]]);
  return weighted([['pending', 45], ['confirmed', 55]]);
};

const catalogueItem = (cake) => {
  const options = cake.weightOptions;
  const weight = weighted(options.map((w, i) => [w, i === 1 ? 6 : 2])); // 1 kg is the usual pick
  const quantity = weight.weightInKg <= 0.5 && chance(0.3) ? 2 : 1;
  const message = chance(0.45) ? pick(CAKE_MESSAGES) : null;

  return {
    cake: cake._id,
    name: cake.name,
    image: cake.images?.[0]?.url || '',
    quantity,
    weight: { weightInKg: weight.weightInKg, label: weight.label, price: weight.price },
    isCustom: false,
    customizations: message
      ? [{ name: 'Custom Message', selectedOption: message, priceAdjustment: 0 }]
      : [],
    itemTotal: weight.price * quantity,
  };
};

const customItem = (design = pick(CUSTOM_DESIGNS)) => ({
  cake: null,
  name: design.name,
  image: '',
  quantity: 1,
  weight: design.weight,
  isCustom: true,
  customizations: [{ name: 'Custom Cake Design', details: design.details, priceAdjustment: design.extra }],
  itemTotal: design.weight.price + design.extra,
});

const usedOrderNumbers = new Set();
const orderNumber = () => {
  let n;
  do n = `SN-${between(1000, 9999)}`; while (usedOrderNumbers.has(n));
  usedOrderNumbers.add(n);
  return n;
};

/** One order placed at `placedAt`, in a state that fits its age. */
const buildOrder = ({ customer, address, placedAt, items, status }) => {
  const ageDays = Math.floor((Date.now() - placedAt.getTime()) / DAY);
  // Today's orders lean cash on delivery, so some are still genuinely pending
  // (an eSewa payment confirms the order straight away)
  const paymentMethod = ageDays === 0
    ? weighted([['esewa', 40], ['cod', 60]])
    : weighted([['esewa', 70], ['cod', 30]]);
  let orderStatus = status || statusForAge(ageDays);
  // Cash-on-delivery orders placed today are still waiting for the bakery
  if (!status && ageDays === 0 && paymentMethod === 'cod') orderStatus = 'pending';
  // A successful eSewa payment auto-confirms the order (Order.markPaidOnce)
  if (paymentMethod === 'esewa' && orderStatus === 'pending') orderStatus = 'confirmed';
  const subtotal = items.reduce((sum, item) => sum + item.itemTotal, 0);
  const total = subtotal + SHIPPING;

  const deliveryDate = new Date(placedAt.getTime() + between(1, 3) * DAY);
  deliveryDate.setHours(0, 0, 0, 0);
  const timeSlot = pick(TIME_SLOTS);
  const slotHour = { '09': 10, '12': 13, '03': 16 }[timeSlot.slice(0, 2)];

  let paymentStatus = 'pending';
  if (paymentMethod === 'esewa') paymentStatus = 'paid';
  if (paymentMethod === 'cod' && orderStatus === 'delivered') paymentStatus = 'paid';

  const order = {
    orderNumber: orderNumber(),
    user: customer._id,
    items,
    shippingAddress: {
      firstName: address.firstName, lastName: address.lastName,
      address: address.address, city: address.city, phone: address.phone,
    },
    contactEmail: customer.email,
    deliverySchedule: { date: deliveryDate, timeSlot },
    specialRequests: chance(0.25) ? pick(SPECIAL_REQUESTS) : undefined,
    paymentMethod,
    paymentStatus,
    orderStatus,
    subtotal,
    shipping: SHIPPING,
    discount: 0,
    total,
    createdAt: placedAt,
    updatedAt: placedAt,
  };

  if (paymentMethod === 'esewa') {
    order.esewa = {
      transactionId: `000${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      refId: crypto.randomBytes(4).toString('hex').toUpperCase(),
      amount: total,
      paidAt: new Date(placedAt.getTime() + 2 * 60 * 1000),
    };
  }

  if (orderStatus === 'delivered') {
    order.deliveredAt = new Date(deliveryDate.getTime() + slotHour * 60 * 60 * 1000 + between(0, 150) * 60 * 1000);
    order.updatedAt = order.deliveredAt;
  }

  if (orderStatus === 'cancelled') {
    order.cancelledAt = new Date(placedAt.getTime() + between(1, 8) * 60 * 60 * 1000);
    order.cancelReason = pick(CANCEL_REASONS);
    order.updatedAt = order.cancelledAt;
    if (paymentStatus === 'paid') {
      order.paymentStatus = 'refunded';
      order.refundedAt = new Date(order.cancelledAt.getTime() + 3 * 60 * 60 * 1000);
      order.refundAmount = total;
      order.refundReason = 'Cancelled before baking started';
      order.updatedAt = order.refundedAt;
    }
  }

  return order;
};

/** A random time between 9 am and 8 pm on the given day. */
const placedOn = (date) => {
  const placed = new Date(date);
  placed.setHours(between(9, 19), between(0, 59), between(0, 59), 0);
  return placed > new Date() ? new Date(Date.now() - between(5, 90) * 60 * 1000) : placed;
};

const createOrders = async (customers, cakes) => {
  // Popular cakes sell more often
  const popularity = {
    'Dark Chocolate Cake': 9, 'Black Forest Delight': 8, 'Red Velvet Romance': 7,
    'Strawberry Cheesecake': 6, 'Midnight Truffle': 5, 'Classic Vanilla Bean': 4,
    'Wild Berry Bliss': 4, 'Tropical Pineapple Crush': 3, 'Citrus Cloud': 2,
  };
  const cakePool = cakes.map((c) => [c, popularity[c.name] || 2]);
  // Some customers are regulars
  const customerPool = customers.map((c, i) => [c, i % 4 === 0 ? 5 : 1]);

  const orders = [];
  for (let ago = DAYS_OF_HISTORY; ago >= 0; ago--) {
    const day = new Date(Date.now() - ago * DAY);
    // Keep the last week visibly busy for the dashboard chart, and today busy
    // enough to have orders waiting
    const count = Math.max(ordersForDay(day), ago === 0 ? 4 : ago <= 7 ? 1 : 0);

    for (let i = 0; i < count; i++) {
      const customer = weighted(customerPool);
      const items = chance(0.12)
        ? [customItem()]
        : chance(0.2)
          ? [catalogueItem(weighted(cakePool)), catalogueItem(weighted(cakePool))]
          : [catalogueItem(weighted(cakePool))];
      orders.push(buildOrder({ customer, address: customer.addresses[0], placedAt: placedOn(day), items }));
    }
  }

  // insertMany skips the "delivery must be in the future" save hook, which
  // is right for historical orders, and keeps our createdAt dates.
  return Order.insertMany(orders, { timestamps: false });
};

/** The demo customer gets a believable history, plus one order on its way today. */
const createDemoHistory = async (cakes) => {
  const demo = await User.findOne({ email: DEMO_ACCOUNTS.customer.email, isDemo: true });
  if (!demo) {
    console.log('Demo customer not found (DEMO_ACCOUNTS_ENABLED off?) - skipping its history.');
    return 0;
  }

  const address = {
    label: 'Home', firstName: 'Demo', lastName: 'Customer',
    address: 'House 21, Baluwatar Marg', city: 'Kathmandu', phone: '9841000000', isDefault: true,
  };
  if (!demo.addresses?.length) {
    await User.updateOne({ _id: demo._id }, { $set: { addresses: [address] } });
  }

  const byName = (name) => cakes.find((c) => c.name === name) || cakes[0];
  const history = [
    { ago: 34, items: [catalogueItem(byName('Black Forest Delight'))], status: 'delivered' },
    { ago: 19, items: [customItem(CUSTOM_DESIGNS[0])], status: 'delivered' },
    { ago: 6, items: [catalogueItem(byName('Red Velvet Romance')), catalogueItem(byName('Classic Vanilla Bean'))], status: 'delivered' },
    { ago: 1, items: [catalogueItem(byName('Dark Chocolate Cake'))], status: 'out_for_delivery' },
  ];

  const orders = history.map(({ ago, items, status }) =>
    buildOrder({
      customer: demo,
      address,
      placedAt: placedOn(new Date(Date.now() - ago * DAY)),
      items,
      status,
    })
  );
  // The one on its way is due today, in the last slot of the day, so the
  // tracking page reads "On Time" for as much of the day as possible
  const onItsWay = orders[orders.length - 1];
  onItsWay.deliverySchedule.date = new Date(new Date().setHours(0, 0, 0, 0));
  onItsWay.deliverySchedule.timeSlot = '03:00 PM - 06:00 PM';

  await Order.insertMany(orders, { timestamps: false });
  return orders.length;
};

/**
 * Review text that fits the cake and the rating, never repeating a comment
 * on the same cake (copy-pasted reviews are the first thing that looks fake).
 * Returns null once a cake has used up every fitting line.
 */
const usedComments = new Map(); // cake name -> Set of comments
const reviewText = (cakeName, rating) => {
  const used = usedComments.get(cakeName) || new Set();
  usedComments.set(cakeName, used);

  const specific = rating >= 4 ? CAKE_REVIEWS[cakeName] || [] : [];
  const fresh = (lines) => lines.filter((line) => !used.has(line));
  const pool = fresh(specific).length && chance(0.6) ? fresh(specific) : fresh(GENERAL_REVIEWS[rating]);
  if (pool.length === 0) return null;

  const text = pick(pool);
  used.add(text);
  return text;
};

const createReviews = async (orders, customers) => {
  const reviewed = new Set();
  const reviews = [];

  for (const order of orders) {
    if (order.orderStatus !== 'delivered') continue;
    const customer = customers.find((c) => c._id.equals(order.user));
    if (!customer) continue; // demo customer: no public reviews

    for (const item of order.items) {
      if (item.isCustom || !item.cake || !chance(0.55)) continue;
      const key = `${order.user}:${item.cake}`;
      if (reviewed.has(key)) continue; // one review per customer per cake
      reviewed.add(key);

      const rating = weighted([[5, 62], [4, 29], [3, 9]]);
      const reviewedAt = new Date(order.deliveredAt.getTime() + between(4, 60) * 60 * 60 * 1000);
      if (reviewedAt > new Date()) continue;
      const comment = reviewText(item.name, rating);
      if (!comment) continue;

      const voters = customers.filter((c) => !c._id.equals(customer._id) && chance(0.12)).map((c) => c._id);
      reviews.push({
        cake: item.cake,
        user: customer._id,
        rating,
        comment,
        reviewerName: customer.name,
        isVerifiedPurchase: true,
        isApproved: true,
        helpfulVotes: voters,
        helpfulCount: voters.length,
        createdAt: reviewedAt,
        updatedAt: reviewedAt,
      });
    }
  }

  return Review.insertMany(reviews, { timestamps: false });
};

/**
 * Sweet Points the way the app awards them: on delivery, using the same
 * formula, with the first-order bonus on a customer's first order.
 */
const awardPoints = async (userIds) => {
  const orders = await Order.find({ user: { $in: userIds } }).sort({ createdAt: 1 });
  const byUser = new Map();
  for (const order of orders) {
    const key = order.user.toString();
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(order);
  }

  const updates = [];
  for (const [userId, userOrders] of byUser) {
    let balance = 0;
    const history = [];
    userOrders
      .filter((o) => o.orderStatus !== 'cancelled')
      .forEach((order, index) => {
        if (order.orderStatus !== 'delivered') return;
        const amount = calculatePointsEarned(order.total, index === 0);
        balance += amount;
        history.push({
          amount,
          type: 'earned',
          description: index === 0 ? 'Earned from first order + bonus' : 'Earned from order',
          relatedOrder: order._id,
          createdAt: order.deliveredAt,
        });
      });
    updates.push({
      updateOne: {
        filter: { _id: userId },
        update: { $set: { sweetPoints: balance, pointsHistory: history } },
      },
    });
  }
  if (updates.length) await User.bulkWrite(updates);
};

const run = async () => {
  ensureSafeToRun();
  await mongoose.connect(process.env.DB_URL);

  await wipe();

  if (!wipeOnly) {
    const cakes = await Cake.find({ isActive: true, 'weightOptions.0': { $exists: true } });
    if (cakes.length === 0) throw new Error('No active cakes found - run scripts/seedCatalog.js first.');

    const customers = await createCustomers();
    const orders = await createOrders(customers, cakes);
    const demoOrders = await createDemoHistory(cakes);
    const reviews = await createReviews(orders, customers);

    const demo = await User.findOne({ email: DEMO_ACCOUNTS.customer.email, isDemo: true }).select('_id');
    await awardPoints([...customers.map((c) => c._id), ...(demo ? [demo._id] : [])]);

    const revenue = orders
      .filter((o) => o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + o.total, 0);
    console.log(
      `Created ${customers.length} sample customers, ${orders.length} orders ` +
      `(+${demoOrders} for the demo customer), ${reviews.length} reviews. ` +
      `Paid revenue: Rs. ${revenue.toLocaleString('en-IN')}.`
    );
  }

  // Bring every cake's rating in line with the reviews that now exist. This
  // also clears stale counts left by earlier load-test data.
  const allCakes = await Cake.find().select('_id');
  for (const cake of allCakes) await Review.calculateAverageRating(cake._id);
  console.log(`Recalculated ratings for ${allCakes.length} cakes.`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Showcase seed failed:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});

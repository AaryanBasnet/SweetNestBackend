/**
 * Seed a small, real-looking cake catalog.
 *
 * NOT the load-test data in scripts/seed.js. This is the opposite problem:
 * after running that script and later wiping it (scripts/seed.js --wipe-only),
 * the catalog was back down to just the two hero cakes - correct for the
 * homepage hero, but not enough for the menu, a product card grid, or a cake
 * detail page to look like a real site rather than an empty shell.
 *
 * Content here is not invented from nothing. The three "Crowd Favorites" cakes
 * (name, description, price, photo) are copied verbatim from the fallback
 * data already hardcoded into src/components/home/CrowdFavorites.jsx on the
 * frontend - that component shows them whenever the API has fewer than 3
 * cakes sorted by rating, which was always, because they never existed as
 * real cakes. Seeding them for real means that component's "real" path and
 * its fallback path now render identically, and a change to one the other
 * does not silently stop actually being tested by it. The other four reuse
 * photography already proven to load on this site - the flavour options in
 * the cake configurator (src/components/cake/configurator/cakeConfigConstants.js)
 * - rather than guessing at a new Unsplash photo id that might 404.
 *
 * Every cake here has isFeatured: false. The hero is seedHeroCakes.js's job
 * alone; this script must never be able to compete with it for the hero slot.
 *
 * Idempotent and safe to run in any environment, including after a real
 * deploy - unlike scripts/seed.js, nothing here is disposable load-test
 * volume to be wiped later. It is meant to become real catalog content.
 *
 * USAGE:
 *   node scripts/seedCatalog.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Category = require('../model/Category');
const Cake = require('../model/Cake');

const CATALOG = [
  // --- Copied verbatim from CrowdFavorites.jsx's FALLBACK_FAVORITES -------
  {
    name: 'Wild Berry Bliss',
    description: 'Sponge cake, cream, fresh berries',
    category: 'Cheesecakes',
    imageId: '1535141192574-5d4897c12636',
    publicId: 'catalog/wild-berry-bliss',
    flavorTags: ['Berry', 'Fruit'],
    badges: [],
    basePrice: 555,
  },
  {
    name: 'Midnight Truffle',
    description: '85% Dark Chocolate, Gold flakes',
    category: 'Birthday Cakes',
    imageId: '1578985545062-69928b1d9587',
    publicId: 'catalog/midnight-truffle',
    flavorTags: ['Chocolate'],
    badges: ['bestSeller'],
    basePrice: 620,
  },
  {
    name: 'Citrus Cloud',
    description: 'Lemon zest, poppy seeds, glaze',
    category: 'Cupcakes',
    imageId: '1621303837174-89787a7d4729',
    publicId: 'catalog/citrus-cloud',
    flavorTags: ['Citrus'],
    badges: [],
    basePrice: 480,
  },

  // --- New entries, reusing flavour photography from the configurator -----
  {
    name: 'Classic Vanilla Bean',
    description:
      'A timeless vanilla sponge with real vanilla bean specks, layered with a light whipped cream - the cake everyone can agree on.',
    category: 'Birthday Cakes',
    imageId: '1464349095431-e9a21285b5f3',
    publicId: 'catalog/classic-vanilla-bean',
    flavorTags: ['Vanilla'],
    badges: [],
    basePrice: 500,
  },
  {
    name: 'Black Forest Delight',
    description:
      'Dark chocolate sponge, whipped cream, and a generous layer of cherries - the German classic, made the traditional way.',
    category: 'Anniversary Cakes',
    imageId: '1606890737304-57a1ca8a5b62',
    publicId: 'catalog/black-forest-delight',
    flavorTags: ['Chocolate', 'Fruit'],
    badges: ['bestSeller'],
    basePrice: 700,
  },
  {
    name: 'Red Velvet Romance',
    description:
      'Velvety red sponge with a tangy cream cheese frosting between every layer - striking on the table, softer than it looks.',
    category: 'Wedding Cakes',
    imageId: '1616541823729-00fe0aacd32c',
    publicId: 'catalog/red-velvet-romance',
    flavorTags: ['Vanilla'],
    badges: ['newArrival'],
    basePrice: 750,
  },
  {
    name: 'Tropical Pineapple Crush',
    description:
      'Light sponge, fresh pineapple, and a whipped cream frosting - a bright, not-too-sweet cake built for warm-weather celebrations.',
    category: 'Custom Orders',
    imageId: '1490885578174-acda8905c2c6',
    publicId: 'catalog/tropical-pineapple-crush',
    flavorTags: ['Fruit', 'Tropical'],
    badges: [],
    basePrice: 580,
  },
];

const weightOptionsFor = (basePrice) => [
  { weightInKg: 0.5, label: '500g', price: basePrice, isDefault: true },
  { weightInKg: 1, label: '1 kg', price: Math.round(basePrice * 1.75) },
  { weightInKg: 1.5, label: '1.5 kg', price: Math.round(basePrice * 2.45) },
];

const imageUrl = (imageId) =>
  `https://images.unsplash.com/photo-${imageId}?q=80&w=800&auto=format&fit=crop`;

async function getCategoryIds() {
  const names = [...new Set(CATALOG.map((c) => c.category))];
  const categories = await Category.find({ name: { $in: names } });
  const byName = new Map(categories.map((c) => [c.name, c._id]));

  const missing = names.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Categories not found: ${missing.join(', ')}. Run the server once first ` +
        '(it seeds "Featured Cakes") or scripts/seed.js (it seeds the other 8).'
    );
  }

  return byName;
}

async function seedCatalog() {
  const categoryIds = await getCategoryIds();

  let created = 0;
  let skipped = 0;

  for (const item of CATALOG) {
    const existing = await Cake.findOne({ name: item.name });
    if (existing) {
      skipped += 1;
      continue;
    }

    await Cake.create({
      name: item.name,
      description: item.description,
      category: categoryIds.get(item.category),
      images: [{ public_id: item.publicId, url: imageUrl(item.imageId) }],
      weightOptions: weightOptionsFor(item.basePrice),
      flavorTags: item.flavorTags,
      badges: item.badges,
      isActive: true,
      isFeatured: false, // the hero slot belongs to seedHeroCakes.js alone
      ratingsAverage: 0,
      ratingsCount: 0,
    });
    created += 1;
    console.log(`Created: ${item.name}`);
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped} already present.`);
}

async function main() {
  const dbUrl = process.env.DB_URL;
  if (!dbUrl) throw new Error('DB_URL not set in .env');

  await mongoose.connect(dbUrl);
  await seedCatalog();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Catalog seed failed:', err);
  process.exit(1);
});

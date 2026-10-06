/**
 * Move cake photos that live on other sites (imgur and the like) onto our own
 * Cloudinary account, in a size and format fit for the web.
 *
 * WHY: two cakes pointed at full-size imgur PNGs (a 900 KB hero image, a 340 KB
 * card image). On a phone that one file takes longer to arrive than everything
 * else on the home page together. Cloudinary serves the same picture resized and
 * as WebP/AVIF (transparency kept), typically a tenth of the size, and the shop
 * no longer depends on a third-party host staying up.
 *
 * Unsplash photos are left alone: their URLs already ask for an 800px version
 * and arrive at 50-90 KB.
 *
 * Safe by default: it only PRINTS what it would change. Nothing is uploaded or
 * saved until you add --confirm.
 *
 * USAGE:
 *   node scripts/rehostImages.js             # preview
 *   node scripts/rehostImages.js --confirm   # upload and update the cakes
 *
 * Needs DB_URL and the CLOUDINARY_* variables in the environment.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Cake = require('../model/Cake');
const { cloudinary } = require('../config/cloudinary');

const KEEP_HOSTS = ['res.cloudinary.com', 'images.unsplash.com'];

const confirm = process.argv.includes('--confirm');

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

const needsRehosting = (image) => image.url && !KEEP_HOSTS.includes(hostOf(image.url));

/** Fetch the picture, store it, and return the web-ready delivery URL. */
const rehost = async (cake, image, index) => {
  const uploaded = await cloudinary.uploader.upload(image.url, {
    folder: 'sweetnest/cakes',
    resource_type: 'image',
    public_id: `${cake.slug}-${index + 1}`,
    overwrite: true,
    transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
  });

  return {
    public_id: uploaded.public_id,
    url: cloudinary.url(uploaded.public_id, {
      secure: true,
      transformation: [{ width: 900, crop: 'limit' }, { fetch_format: 'auto', quality: 'auto' }],
    }),
  };
};

const run = async () => {
  if (!process.env.DB_URL) throw new Error('DB_URL is not set.');
  if (confirm && !process.env.CLOUDINARY_CLOUD_NAME) {
    throw new Error('The CLOUDINARY_* variables are not set.');
  }

  await mongoose.connect(process.env.DB_URL);

  const cakes = await Cake.find({ 'images.url': { $exists: true } });
  const work = cakes.filter((cake) => cake.images.some(needsRehosting));

  console.log(`${work.length} of ${cakes.length} cakes have photos hosted elsewhere.\n`);

  for (const cake of work) {
    for (const [index, image] of cake.images.entries()) {
      if (!needsRehosting(image)) continue;

      console.log(`${cake.name} (image ${index + 1}): ${image.url}`);
      if (!confirm) continue;

      const moved = await rehost(cake, image, index);
      cake.images[index] = moved;
      console.log(`  -> ${moved.url}`);
    }
    if (confirm) await cake.save();
  }

  if (!confirm) console.log('\nPreview only. Nothing was changed. Add --confirm to move them.');
};

run()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

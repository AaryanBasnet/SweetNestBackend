/**
 * Wishlist Controller
 * CRUD operations for user wishlists
 */

const asyncHandler = require('express-async-handler');
const Wishlist = require('../model/Wishlist');
const Cake = require('../model/Cake');

// @desc    Get user's wishlist
// @route   GET /api/wishlist
// @access  Private
const getWishlist = asyncHandler(async (req, res) => {
  let wishlist = await Wishlist.findOne({ user: req.user._id }).populate({
    path: 'items.cake',
    select: 'name slug images weightOptions basePrice ratingsAverage ratingsCount isActive',
    populate: {
      path: 'category',
      select: 'name slug',
    },
  });

  // Create empty wishlist if doesn't exist
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: req.user._id, items: [] });
  }

  // Filter out inactive cakes
  const activeItems = wishlist.items.filter((item) => item.cake && item.cake.isActive);

  res.status(200).json({
    success: true,
    message: 'Wishlist fetched successfully',
    data: {
      items: activeItems,
      count: activeItems.length,
    },
  });
});

// @desc    Add item to wishlist
// @route   POST /api/wishlist
// @access  Private
const addToWishlist = asyncHandler(async (req, res) => {
  const { cakeId } = req.body;

  // Verify cake exists and is active
  const cake = await Cake.findOne({ _id: cakeId, isActive: true });
  if (!cake) {
    res.status(404);
    throw new Error('Cake not found or unavailable');
  }

  let wishlist = await Wishlist.findOne({ user: req.user._id });

  if (!wishlist) {
    wishlist = await Wishlist.create({
      user: req.user._id,
      items: [{ cake: cakeId }],
    });
  } else {
    // Check if already in wishlist
    const exists = wishlist.items.some(
      (item) => item.cake.toString() === cakeId
    );

    if (exists) {
      res.status(400);
      throw new Error('Item already in wishlist');
    }

    wishlist.items.push({ cake: cakeId });
    await wishlist.save();
  }

  // Populate and return
  await wishlist.populate({
    path: 'items.cake',
    select: 'name slug images weightOptions basePrice ratingsAverage ratingsCount isActive',
  });

  res.status(201).json({
    success: true,
    message: 'Added to wishlist',
    data: {
      items: wishlist.items,
      count: wishlist.items.length,
    },
  });
});

// @desc    Remove item from wishlist
// @route   DELETE /api/wishlist/:cakeId
// @access  Private
const removeFromWishlist = asyncHandler(async (req, res) => {
  const { cakeId } = req.params;

  const wishlist = await Wishlist.findOne({ user: req.user._id });

  if (!wishlist) {
    res.status(404);
    throw new Error('Wishlist not found');
  }

  const itemIndex = wishlist.items.findIndex(
    (item) => item.cake.toString() === cakeId
  );

  if (itemIndex === -1) {
    res.status(404);
    throw new Error('Item not in wishlist');
  }

  wishlist.items.splice(itemIndex, 1);
  await wishlist.save();

  res.status(200).json({
    success: true,
    message: 'Removed from wishlist',
    data: {
      count: wishlist.items.length,
    },
  });
});

// @desc    Sync wishlist (merge localStorage with server)
// @route   POST /api/wishlist/sync
// @access  Private
const syncWishlist = asyncHandler(async (req, res) => {
  const { items } = req.body; // Array of cake IDs from localStorage

  if (!Array.isArray(items)) {
    res.status(400);
    throw new Error('Items must be an array');
  }

  // Verify all cakes exist and are active
  const validCakes = await Cake.find({
    _id: { $in: items },
    isActive: true,
  }).select('_id');

  const validCakeIds = validCakes.map((c) => c._id.toString());

  let wishlist = await Wishlist.findOne({ user: req.user._id });

  if (!wishlist) {
    wishlist = await Wishlist.create({
      user: req.user._id,
      items: validCakeIds.map((id) => ({ cake: id })),
    });
  } else {
    // Merge: add items that don't already exist
    const existingIds = wishlist.items.map((item) => item.cake.toString());
    const newItems = validCakeIds.filter((id) => !existingIds.includes(id));

    newItems.forEach((id) => {
      wishlist.items.push({ cake: id });
    });

    await wishlist.save();
  }

  // Populate and return
  await wishlist.populate({
    path: 'items.cake',
    select: 'name slug images weightOptions basePrice ratingsAverage ratingsCount isActive',
  });

  // Filter out any inactive
  const activeItems = wishlist.items.filter((item) => item.cake && item.cake.isActive);

  res.status(200).json({
    success: true,
    message: 'Wishlist synced successfully',
    data: {
      items: activeItems,
      count: activeItems.length,
    },
  });
});

// @desc    Clear wishlist
// @route   DELETE /api/wishlist
// @access  Private
const clearWishlist = asyncHandler(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id });

  if (wishlist) {
    wishlist.items = [];
    await wishlist.save();
  }

  res.status(200).json({
    success: true,
    message: 'Wishlist cleared',
    data: {
      items: [],
      count: 0,
    },
  });
});

// @desc    Set reminder for wishlist item
// @route   PUT /api/wishlist/:cakeId/reminder
// @access  Private
const setReminder = asyncHandler(async (req, res) => {
  const { cakeId } = req.params;
  const { enabled, date, note } = req.body;

  const wishlist = await Wishlist.findOne({ user: req.user._id });

  if (!wishlist) {
    res.status(404);
    throw new Error('Wishlist not found');
  }

  const item = wishlist.items.find((item) => item.cake.toString() === cakeId);

  if (!item) {
    res.status(404);
    throw new Error('Item not in wishlist');
  }

  item.reminder = {
    enabled: enabled ?? false,
    date: date ? new Date(date) : undefined,
    note: note || '',
  };

  await wishlist.save();

  res.status(200).json({
    success: true,
    message: 'Reminder updated',
  });
});

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  syncWishlist,
  clearWishlist,
  setReminder,
};

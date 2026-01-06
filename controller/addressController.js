/**
 * Address Controller
 * Handles all address management operations
 * Addresses are embedded in User model as subdocuments
 */

const User = require('../model/User');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Create new address
 * @route   POST /api/addresses
 * @access  Private (authenticated users)
 */
const createAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Check address limit
  if (user.addresses.length >= 5) {
    res.status(409);
    throw new Error('Maximum 5 addresses allowed. Please delete an address first.');
  }

  // If this is the first address, set as default
  const isFirstAddress = user.addresses.length === 0;

  // Create new address
  const newAddress = {
    ...req.body,
    isDefault: isFirstAddress,
  };

  user.addresses.push(newAddress);
  await user.save();

  // Get the newly created address (last item in array)
  const createdAddress = user.addresses[user.addresses.length - 1];

  res.status(201).json({
    success: true,
    message: 'Address created successfully',
    data: createdAddress,
  });
});

/**
 * @desc    Get all addresses for current user
 * @route   GET /api/addresses
 * @access  Private (authenticated users)
 */
const getAddresses = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('addresses');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Sort addresses: default first, then by creation date (newest first)
  const sortedAddresses = user.addresses.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.status(200).json({
    success: true,
    count: sortedAddresses.length,
    data: sortedAddresses,
  });
});

/**
 * @desc    Get single address by ID
 * @route   GET /api/addresses/:id
 * @access  Private (authenticated users)
 */
const getAddressById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const address = user.addresses.id(req.params.id);

  if (!address) {
    res.status(404);
    throw new Error('Address not found');
  }

  res.status(200).json({
    success: true,
    data: address,
  });
});

/**
 * @desc    Update address
 * @route   PUT /api/addresses/:id
 * @access  Private (authenticated users, owner only)
 */
const updateAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const address = user.addresses.id(req.params.id);

  if (!address) {
    res.status(404);
    throw new Error('Address not found');
  }

  // Update address fields
  Object.keys(req.body).forEach((key) => {
    if (key !== 'isDefault') {
      // Prevent direct isDefault update (use setDefault endpoint)
      address[key] = req.body[key];
    }
  });

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Address updated successfully',
    data: address,
  });
});

/**
 * @desc    Delete address
 * @route   DELETE /api/addresses/:id
 * @access  Private (authenticated users, owner only)
 */
const deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const address = user.addresses.id(req.params.id);

  if (!address) {
    res.status(404);
    throw new Error('Address not found');
  }

  const wasDefault = address.isDefault;

  // Remove address using pull method
  user.addresses.pull(req.params.id);

  // If deleted address was default and there are remaining addresses, set first one as default
  if (wasDefault && user.addresses.length > 0) {
    user.addresses[0].isDefault = true;
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Address deleted successfully',
  });
});

/**
 * @desc    Set address as default
 * @route   PATCH /api/addresses/:id/default
 * @access  Private (authenticated users, owner only)
 */
const setDefaultAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const address = user.addresses.id(req.params.id);

  if (!address) {
    res.status(404);
    throw new Error('Address not found');
  }

  // Set all addresses to non-default
  user.addresses.forEach((addr) => {
    addr.isDefault = false;
  });

  // Set selected address as default
  address.isDefault = true;

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Default address updated successfully',
    data: address,
  });
});

module.exports = {
  createAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};

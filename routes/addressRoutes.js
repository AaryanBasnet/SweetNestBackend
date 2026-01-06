/**
 * Address Routes
 * All routes for address management
 * All routes require authentication (protect middleware)
 */

const express = require('express');
const router = express.Router();
const {
  createAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require('../controller/addressController');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');
const {
  createAddressSchema,
  updateAddressSchema,
  deleteAddressSchema,
  getAddressSchema,
  setDefaultAddressSchema,
} = require('../validators/addressValidators');

// All routes require authentication
router.use(protect);

// CRUD routes for addresses
router
  .route('/')
  .post(validate(createAddressSchema), createAddress) // Create new address
  .get(getAddresses); // Get all user addresses

router
  .route('/:id')
  .get(validate(getAddressSchema), getAddressById) // Get single address
  .put(validate(updateAddressSchema), updateAddress) // Update address
  .delete(validate(deleteAddressSchema), deleteAddress); // Delete address

// Set default address
router.patch(
  '/:id/default',
  validate(setDefaultAddressSchema),
  setDefaultAddress
);

module.exports = router;

/**
 * Contact Routes
 * API endpoints for contact form submissions
 */

const express = require('express');
const router = express.Router();

const {
  submitContactForm,
  getAllContacts,
  getContactById,
  updateContactStatus,
  replyToContact,
  deleteContact,
} = require('../controller/contactController');

const { protect, admin } = require('../middleware/authMiddleware');

// --- PUBLIC ROUTES ---
router.post('/', submitContactForm);

// --- ADMIN ROUTES ---
router.get('/', protect, admin, getAllContacts);
router.get('/:id', protect, admin, getContactById);
router.patch('/:id/status', protect, admin, updateContactStatus);
router.post('/:id/reply', protect, admin, replyToContact);
router.delete('/:id', protect, admin, deleteContact);

module.exports = router;

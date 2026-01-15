/**
 * Contact Controller
 * Handle contact form submissions
 */

const asyncHandler = require('express-async-handler');
const Contact = require('../model/Contact');

// @desc    Submit contact form
// @route   POST /api/contact
// @access  Public
const submitContactForm = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;

  // Get user ID if authenticated (optional)
  const userId = req.user?._id || null;

  const contact = await Contact.create({
    name,
    email,
    subject,
    message,
    user: userId,
  });

  res.status(201).json({
    success: true,
    message: 'Thank you for contacting us! We will get back to you soon.',
    data: contact,
  });
});

// @desc    Get all contact messages (admin)
// @route   GET /api/contact
// @access  Private/Admin
const getAllContacts = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const [contacts, totalItems] = await Promise.all([
    Contact.find(filter)
      .populate('user', 'name email')
      .populate('reply.repliedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Contact.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: contacts.length,
    totalItems,
    currentPage: Number(page),
    totalPages: Math.ceil(totalItems / limit),
    data: contacts,
  });
});

// @desc    Get single contact message
// @route   GET /api/contact/:id
// @access  Private/Admin
const getContactById = asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id)
    .populate('user', 'name email')
    .populate('reply.repliedBy', 'name');

  if (!contact) {
    res.status(404);
    throw new Error('Contact message not found');
  }

  // Mark as read
  if (contact.status === 'new') {
    contact.status = 'read';
    await contact.save();
  }

  res.status(200).json({
    success: true,
    data: contact,
  });
});

// @desc    Update contact status
// @route   PATCH /api/contact/:id/status
// @access  Private/Admin
const updateContactStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    res.status(404);
    throw new Error('Contact message not found');
  }

  contact.status = status;
  await contact.save();

  res.status(200).json({
    success: true,
    message: 'Status updated successfully',
    data: contact,
  });
});

// @desc    Reply to contact message
// @route   POST /api/contact/:id/reply
// @access  Private/Admin
const replyToContact = asyncHandler(async (req, res) => {
  const { message } = req.body;

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    res.status(404);
    throw new Error('Contact message not found');
  }

  contact.reply = {
    message,
    repliedBy: req.user._id,
    repliedAt: new Date(),
  };
  contact.status = 'replied';

  await contact.save();

  // TODO: Send email to user with the reply

  res.status(200).json({
    success: true,
    message: 'Reply sent successfully',
    data: contact,
  });
});

// @desc    Delete contact message
// @route   DELETE /api/contact/:id
// @access  Private/Admin
const deleteContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    res.status(404);
    throw new Error('Contact message not found');
  }

  await contact.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Contact message deleted successfully',
  });
});

module.exports = {
  submitContactForm,
  getAllContacts,
  getContactById,
  updateContactStatus,
  replyToContact,
  deleteContact,
};

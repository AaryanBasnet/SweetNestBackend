/**
 * Upload Middleware
 * Handles file uploads using Multer with memory storage
 * Then uploads to Cloudinary manually (more control, no peer dep issues)
 */

const multer = require('multer');
const { uploadImage } = require('../config/cloudinary');

// Use memory storage - files stored as buffers
const storage = multer.memoryStorage();

// File filter - only allow images
const imageFileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
  }
};

// Multer upload instances
const uploadCakeImages = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 5, // Max 5 files
  },
});

const uploadCategoryImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max
    files: 1, // Single file
  },
});

// Error handling middleware for multer
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 5 images.',
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Error uploading file',
    });
  }

  next();
};

/**
 * Upload buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<object>} - Upload result
 */
const uploadBufferToCloudinary = (buffer, folder = 'sweetnest/cakes') => {
  return new Promise((resolve, reject) => {
    const base64 = buffer.toString('base64');
    const dataUri = `data:image/jpeg;base64,${base64}`;

    uploadImage(dataUri, { folder })
      .then(resolve)
      .catch(reject);
  });
};

/**
 * Process uploaded files and upload to Cloudinary
 * @param {Array} files - Multer files array
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<Array>} - Array of Cloudinary results
 */
const processAndUploadFiles = async (files, folder = 'sweetnest/cakes') => {
  if (!files || files.length === 0) return [];

  const uploadPromises = files.map((file) => uploadBufferToCloudinary(file.buffer, folder));
  return Promise.all(uploadPromises);
};

/**
 * Process single file and upload to Cloudinary
 * @param {object} file - Multer file object
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<object|null>} - Cloudinary result or null
 */
const processAndUploadSingleFile = async (file, folder = 'sweetnest/categories') => {
  if (!file) return null;
  return uploadBufferToCloudinary(file.buffer, folder);
};

// Legacy helper functions for backward compatibility
const extractCloudinaryData = (files) => {
  // This is now handled by processAndUploadFiles
  // Kept for interface compatibility
  return files || [];
};

const extractSingleCloudinaryData = (file) => {
  // This is now handled by processAndUploadSingleFile
  // Kept for interface compatibility
  return file || null;
};

module.exports = {
  uploadCakeImages,
  uploadCategoryImage,
  handleUploadError,
  processAndUploadFiles,
  processAndUploadSingleFile,
  extractCloudinaryData,
  extractSingleCloudinaryData,
};

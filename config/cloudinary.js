/**
 * Cloudinary Configuration
 * Standalone cloud image storage configuration
 * Only depends on cloudinary package and environment variables
 */

const cloudinary = require('cloudinary').v2;

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload image to Cloudinary
 * @param {string} filePath - Local file path or base64 string
 * @param {object} options - Upload options
 * @returns {Promise<object>} - Cloudinary upload result
 */
const uploadImage = async (filePath, options = {}) => {
  const defaultOptions = {
    folder: 'sweetnest/cakes',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 1000, height: 1000, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'auto' },
    ],
  };

  const result = await cloudinary.uploader.upload(filePath, {
    ...defaultOptions,
    ...options,
  });

  return {
    public_id: result.public_id,
    url: result.secure_url,
    width: result.width,
    height: result.height,
  };
};

/**
 * Upload multiple images to Cloudinary
 * @param {Array<string>} filePaths - Array of file paths
 * @param {object} options - Upload options
 * @returns {Promise<Array>} - Array of upload results
 */
const uploadMultipleImages = async (filePaths, options = {}) => {
  const uploadPromises = filePaths.map((filePath) => uploadImage(filePath, options));
  return Promise.all(uploadPromises);
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<object>} - Deletion result
 */
const deleteImage = async (publicId) => {
  const result = await cloudinary.uploader.destroy(publicId);
  return result;
};

/**
 * Delete multiple images from Cloudinary
 * @param {Array<string>} publicIds - Array of Cloudinary public IDs
 * @returns {Promise<object>} - Deletion result
 */
const deleteMultipleImages = async (publicIds) => {
  if (!publicIds || publicIds.length === 0) return { deleted: {} };
  const result = await cloudinary.api.delete_resources(publicIds);
  return result;
};

module.exports = {
  cloudinary,
  uploadImage,
  uploadMultipleImages,
  deleteImage,
  deleteMultipleImages,
};

/**
 * API Response Utility
 * Standardized response format for all API endpoints
 * Zero dependencies - standalone utility
 */

/**
 * Success response
 * @param {object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Success message
 * @param {object} data - Response data
 */
const successResponse = (res, statusCode = 200, message = 'Success', data = null) => {
  const response = {
    success: true,
    message,
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Error response
 * @param {object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 */
const errorResponse = (res, statusCode = 500, message = 'Something went wrong') => {
  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * Paginated response
 * @param {object} res - Express response object
 * @param {string} message - Success message
 * @param {object} data - Response data with pagination
 */
const paginatedResponse = (res, message = 'Success', data = {}) => {
  return res.status(200).json({
    success: true,
    message,
    data: data.docs || data.results || [],
    pagination: {
      currentPage: data.page || 1,
      totalPages: data.totalPages || 1,
      totalItems: data.totalDocs || data.total || 0,
      itemsPerPage: data.limit || 10,
      hasNextPage: data.hasNextPage || false,
      hasPrevPage: data.hasPrevPage || false,
    },
  });
};

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse,
};

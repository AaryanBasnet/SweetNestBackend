/**
 * Pagination Utility
 * Helper functions for paginating MongoDB queries
 * Zero dependencies - standalone utility
 */

/**
 * Parse pagination parameters from query string
 * @param {object} query - Express req.query object
 * @returns {object} - Pagination options
 */
const getPaginationOptions = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Build pagination metadata
 * @param {number} totalItems - Total number of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {object} - Pagination metadata
 */
const buildPaginationMeta = (totalItems, page, limit) => {
  const totalPages = Math.ceil(totalItems / limit);

  return {
    currentPage: page,
    totalPages,
    totalItems,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

/**
 * Parse sort parameters from query string
 * @param {string} sortQuery - Sort query string (e.g., "-createdAt" or "price,-name")
 * @param {object} allowedFields - Object with allowed sort fields
 * @returns {object} - MongoDB sort object
 */
const getSortOptions = (sortQuery, allowedFields = {}) => {
  if (!sortQuery) {
    return { createdAt: -1 }; // Default: newest first
  }

  const sortObj = {};
  const fields = sortQuery.split(',');

  fields.forEach((field) => {
    const trimmed = field.trim();
    if (trimmed.startsWith('-')) {
      const fieldName = trimmed.slice(1);
      if (!allowedFields || allowedFields[fieldName]) {
        sortObj[fieldName] = -1;
      }
    } else {
      if (!allowedFields || allowedFields[trimmed]) {
        sortObj[trimmed] = 1;
      }
    }
  });

  return Object.keys(sortObj).length > 0 ? sortObj : { createdAt: -1 };
};

module.exports = {
  getPaginationOptions,
  buildPaginationMeta,
  getSortOptions,
};

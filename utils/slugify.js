/**
 * Slugify Utility
 * Converts strings to URL-friendly slugs
 * Zero dependencies - standalone utility
 */

/**
 * Convert a string to a URL-friendly slug
 * @param {string} text - The text to slugify
 * @returns {string} - URL-friendly slug
 */
const slugify = (text) => {
  if (!text) return '';

  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')        // Replace spaces with -
    .replace(/[^\w\-]+/g, '')    // Remove all non-word chars
    .replace(/\-\-+/g, '-')      // Replace multiple - with single -
    .replace(/^-+/, '')          // Trim - from start of text
    .replace(/-+$/, '');         // Trim - from end of text
};

/**
 * Generate a unique slug by appending a random suffix
 * @param {string} text - The text to slugify
 * @returns {string} - Unique URL-friendly slug
 */
const uniqueSlugify = (text) => {
  const baseSlug = slugify(text);
  const suffix = Date.now().toString(36).slice(-4);
  return `${baseSlug}-${suffix}`;
};

module.exports = { slugify, uniqueSlugify };

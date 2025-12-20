/**
 * Validators Index
 * Export all validation schemas
 */

module.exports = {
  user: require('./userValidators'),
  category: require('./categoryValidators'),
  cake: require('./cakeValidators'),
  review: require('./reviewValidators'),
};

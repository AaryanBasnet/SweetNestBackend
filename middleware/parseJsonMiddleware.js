const parseJsonBody = (req, res, next) => {
  const fields = ['weightOptions', 'ingredients', 'deliveryInfo', 'badges', 'customizationOptions', 'flavorTags', 'removeImages'];
  
  fields.forEach(field => {
    if (req.body[field] && typeof req.body[field] === 'string') {
      try {
        req.body[field] = JSON.parse(req.body[field]);
      } catch (_e) {
        // Leave the raw string in place: multipart form fields are not always
        // JSON, and the route's Zod schema is what decides if it is valid.
      }
    }
  });

  if (req.body.isActive !== undefined) req.body.isActive = String(req.body.isActive) === 'true';
  if (req.body.isFeatured !== undefined) req.body.isFeatured = String(req.body.isFeatured) === 'true';
  
  next();
};
module.exports = { parseJsonBody };
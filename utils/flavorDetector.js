/**
 * Flavor Detector Utility
 * Auto-detects flavor tags from cake name, description, and ingredients
 */

// Flavor keywords mapping - key is the tag, value is array of keywords to match
const FLAVOR_KEYWORDS = {
  Chocolate: [
    'chocolate', 'choco', 'cocoa', 'brownie', 'fudge', 'ganache', 'truffle', 'dark chocolate', 'milk chocolate', 'white chocolate'
  ],
  Vanilla: [
    'vanilla', 'vanila', 'french vanilla', 'madagascar vanilla'
  ],
  Fruit: [
    'fruit', 'fruity', 'mixed fruit', 'fresh fruit', 'seasonal fruit'
  ],
  Nut: [
    'nut', 'nuts', 'almond', 'walnut', 'hazelnut', 'pistachio', 'cashew', 'peanut', 'pecan', 'macadamia'
  ],
  Spiced: [
    'spice', 'spiced', 'cinnamon', 'ginger', 'cardamom', 'nutmeg', 'clove', 'chai', 'masala'
  ],
  Coffee: [
    'coffee', 'espresso', 'mocha', 'cappuccino', 'latte', 'tiramisu', 'kahlua'
  ],
  Caramel: [
    'caramel', 'butterscotch', 'toffee', 'dulce de leche', 'salted caramel'
  ],
  Citrus: [
    'citrus', 'lemon', 'lime', 'orange', 'tangerine', 'grapefruit', 'zest', 'yuzu'
  ],
  Berry: [
    'berry', 'berries', 'strawberry', 'blueberry', 'raspberry', 'blackberry', 'cranberry', 'mixed berry'
  ],
  Tropical: [
    'tropical', 'mango', 'pineapple', 'coconut', 'passion fruit', 'papaya', 'guava', 'kiwi', 'banana'
  ],
};

/**
 * Detects flavor tags from cake data
 * @param {Object} cakeData - Object containing name, description, ingredients
 * @returns {string[]} - Array of detected flavor tags
 */
function detectFlavorTags(cakeData) {
  const { name = '', description = '', ingredients = [] } = cakeData;

  // Combine all text to search (lowercase)
  const searchText = [
    name,
    description,
    ...ingredients
  ].join(' ').toLowerCase();

  const detectedTags = [];

  // Check each flavor's keywords
  for (const [flavorTag, keywords] of Object.entries(FLAVOR_KEYWORDS)) {
    const hasMatch = keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
    if (hasMatch) {
      detectedTags.push(flavorTag);
    }
  }

  return detectedTags;
}

/**
 * Merges auto-detected tags with manually provided tags
 * @param {Object} cakeData - Cake data with name, description, ingredients
 * @param {string[]} manualTags - Manually provided tags (optional)
 * @returns {string[]} - Combined unique tags
 */
function getFlavorTags(cakeData, manualTags = []) {
  const autoDetected = detectFlavorTags(cakeData);

  // Combine and deduplicate
  const combined = [...new Set([...autoDetected, ...manualTags])];

  // Filter to only valid enum values
  const validTags = ['Chocolate', 'Vanilla', 'Fruit', 'Nut', 'Spiced', 'Coffee', 'Caramel', 'Citrus', 'Berry', 'Tropical'];

  return combined.filter(tag => validTags.includes(tag));
}

module.exports = {
  detectFlavorTags,
  getFlavorTags,
  FLAVOR_KEYWORDS,
};

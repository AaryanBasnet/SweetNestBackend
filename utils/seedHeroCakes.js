/**
 * Seed Hero Cakes
 * Seeds the database with the two featured hero cakes for the homepage
 */

const Cake = require("../model/Cake");
const Category = require("../model/Category");

const seedHeroCakes = async () => {
  try {
    console.log("[Seed] Starting hero cakes seed...");

    // Check if we already have hero cakes (avoid duplicates)
    const existingCount = await Cake.countDocuments({ isFeatured: true });
    if (existingCount >= 2) {
      console.log("[Seed] Hero cakes already exist, skipping seed.");
      return;
    }

    // Get or create a default category
    let category = await Category.findOne({ name: "Featured Cakes" });
    if (!category) {
      category = await Category.create({
        name: "Featured Cakes",
        description: "Our featured collection of premium cakes",
        isActive: true,
        displayOrder: 1,
      });
      console.log("[Seed] Created Featured Cakes category");
    }

    // Hero Cake 1: Strawberry Cheesecake
    const strawberryCake = {
      name: "Strawberry Cheesecake",
      description:
        "Smooth cream cheese base blended with real, juicy strawberries, creating a naturally sweet and creamy flavor in every bite.",
      category: category._id,
      images: [
        {
          public_id: "hero_strawberry_cheesecake",
          // UPDATED: Direct link to your strawberry image
          url: "https://i.imgur.com/dxqsRtt.png",
        },
      ],
      weightOptions: [
        {
          weightInKg: 0.5,
          label: "500g",
          price: 550,
          isDefault: true,
        },
        {
          weightInKg: 1,
          label: "1 kg",
          price: 950,
          isDefault: false,
        },
        {
          weightInKg: 1.5,
          label: "1.5 kg",
          price: 1350,
          isDefault: false,
        },
      ],
      flavorTags: ["Fruit", "Vanilla"],
      badges: ["bestSeller"],
      ingredients: [
        "Cream cheese",
        "Fresh strawberries",
        "Graham cracker crust",
        "Sugar",
        "Vanilla extract",
        "Eggs",
      ],
      storageAndCare: "Keep refrigerated. Best consumed within 3 days.",
      deliveryInfo: {
        nextDayAvailable: true,
        deliveryNote: "Delivered fresh daily",
      },
      isActive: true,
      isFeatured: true,
      ratingsAverage: 4.8,
      ratingsCount: 127,
      isCustomizable: true,
      customizationOptions: [
        {
          name: "Message",
          type: "message",
          options: [
            { label: "Happy Birthday", extraPrice: 0 },
            { label: "Congratulations", extraPrice: 0 },
            { label: "Custom Message", extraPrice: 50 },
          ],
        },
      ],
    };

    // Hero Cake 2: Chocolate Cake
    const chocolateCake = {
      name: "Dark Chocolate Cake",
      description:
        "Layers of moist chocolate sponge with velvety ganache, a timeless classic for chocolate lovers seeking pure indulgence.",
      category: category._id,
      images: [
        {
          public_id: "hero_chocolate_cake",
          // UPDATED: Direct link to your chocolate image
          url: "https://i.imgur.com/KH9wnJQ.png",
        },
      ],
      weightOptions: [
        {
          weightInKg: 0.5,
          label: "500g",
          price: 650,
          isDefault: true,
        },
        {
          weightInKg: 1,
          label: "1 kg",
          price: 1100,
          isDefault: false,
        },
        {
          weightInKg: 1.5,
          label: "1.5 kg",
          price: 1550,
          isDefault: false,
        },
      ],
      flavorTags: ["Chocolate"],
      badges: ["bestSeller", "organic"],
      ingredients: [
        "Premium dark chocolate",
        "Cocoa powder",
        "Butter",
        "Sugar",
        "Eggs",
        "Flour",
        "Vanilla extract",
      ],
      storageAndCare: "Store in cool place. Best consumed within 5 days.",
      deliveryInfo: {
        nextDayAvailable: true,
        deliveryNote: "Made fresh on order",
      },
      isActive: true,
      isFeatured: true,
      ratingsAverage: 4.9,
      ratingsCount: 203,
      isCustomizable: true,
      customizationOptions: [
        {
          name: "Topping",
          type: "topping",
          options: [
            { label: "Chocolate Shavings", extraPrice: 0 },
            { label: "Fresh Berries", extraPrice: 100 },
            { label: "Gold Flakes", extraPrice: 150 },
          ],
        },
        {
          name: "Message",
          type: "message",
          options: [
            { label: "Happy Birthday", extraPrice: 0 },
            { label: "Congratulations", extraPrice: 0 },
            { label: "Custom Message", extraPrice: 50 },
          ],
        },
      ],
    };

    // Insert cakes
    const existingStrawberry = await Cake.findOne({
      name: "Strawberry Cheesecake",
    });
    if (!existingStrawberry) {
      await Cake.create(strawberryCake);
      console.log("[Seed] ✓ Created Strawberry Cheesecake");
    } else {
      console.log("[Seed] Strawberry Cheesecake already exists");
    }

    const existingChocolate = await Cake.findOne({
      name: "Dark Chocolate Cake",
    });
    if (!existingChocolate) {
      await Cake.create(chocolateCake);
      console.log("[Seed] ✓ Created Dark Chocolate Cake");
    } else {
      console.log("[Seed] Dark Chocolate Cake already exists");
    }

    console.log("[Seed] Hero cakes seed completed successfully!");
  } catch (error) {
    console.error("[Seed] Error seeding hero cakes:", error.message);
    // Don't throw error - just log it so server can continue
  }
};

module.exports = seedHeroCakes;

/**
 * Test data factories.
 *
 * Tests should say what they are about, not spend twenty lines assembling a
 * valid Cake. Every factory produces a valid default and takes overrides for
 * the one or two fields the test actually cares about.
 */

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../../model/User");
const Cake = require("../../model/Cake");
const Category = require("../../model/Category");
const Cart = require("../../model/Cart");
const Order = require("../../model/Order");
const Review = require("../../model/Review");

let counter = 0;
const unique = () => `${Date.now()}-${++counter}`;

/** A password that satisfies the model's strength rules. */
const VALID_PASSWORD = "TestPassw0rd!";

const signToken = (userId, overrides = {}) =>
  jwt.sign({ id: userId.toString(), ...overrides }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

/**
 * Creates a user and returns { user, token, password }.
 * The token is what a real client would hold after logging in.
 */
const createUser = async (overrides = {}) => {
  const password = overrides.password || VALID_PASSWORD;

  const user = await User.create({
    name: "Test User",
    email: `user-${unique()}@example.com`,
    password,
    ...overrides,
  });

  return { user, token: signToken(user._id), password };
};

const createAdmin = async (overrides = {}) =>
  createUser({ name: "Test Admin", role: "admin", ...overrides });

const createCategory = async (overrides = {}) =>
  Category.create({
    name: `Category ${unique()}`,
    description: "A test category",
    ...overrides,
  });

/**
 * A cake with two weight options. Prices live here, in the database - which
 * is the whole point of several cart tests: the client never gets to name one.
 */
const createCake = async (overrides = {}) => {
  const category = overrides.category || (await createCategory());

  return Cake.create({
    name: `Test Cake ${unique()}`,
    description: "A cake that exists only for tests",
    category: category._id || category,
    images: [{ public_id: "test/image", url: "https://example.com/cake.jpg" }],
    weightOptions: [
      { weightInKg: 1, label: "1 kg", price: 1200, isDefault: true },
      { weightInKg: 2, label: "2 kg", price: 2200 },
    ],
    isActive: true,
    ...overrides,
  });
};

/** Puts one item in a user's cart, priced from the cake record. */
const createCartWithItem = async (userId, cake, quantity = 1) => {
  const weightOption = cake.weightOptions[0];

  return Cart.create({
    user: userId,
    items: [
      {
        cake: cake._id,
        quantity,
        selectedWeight: {
          weightInKg: weightOption.weightInKg,
          label: weightOption.label,
          price: weightOption.price,
        },
      },
    ],
  });
};

const createOrder = async (userId, overrides = {}) =>
  Order.create({
    orderNumber: `TEST-${unique()}`,
    user: userId,
    items: [
      {
        cake: null,
        name: "Test Cake",
        image: "",
        quantity: 1,
        weight: { weightInKg: 1, label: "1 kg", price: 1500 },
        isCustom: true,
        customizations: [],
        itemTotal: 1500,
      },
    ],
    shippingAddress: {
      firstName: "Test",
      lastName: "User",
      address: "Test Street 1",
      city: "Kathmandu",
      phone: "9800000000",
    },
    contactEmail: "test@example.com",
    deliverySchedule: {
      date: new Date(Date.now() + 86400000),
      timeSlot: "09:00 AM - 12:00 PM",
    },
    paymentMethod: "esewa",
    paymentStatus: "pending",
    orderStatus: "pending",
    subtotal: 1500,
    shipping: 100,
    discount: 0,
    total: 1600,
    esewa: { transactionId: `TXN-TEST-${unique()}` },
    ...overrides,
  });

const createReview = async (userId, cakeId, overrides = {}) =>
  Review.create({
    user: userId,
    cake: cakeId,
    reviewerName: 'Test Reviewer',
    rating: 5,
    comment: "A perfectly adequate test review.",
    isApproved: true,
    ...overrides,
  });

/** Authorization header helper, so tests read as intent not plumbing. */
const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = {
  VALID_PASSWORD,
  signToken,
  createUser,
  createAdmin,
  createCategory,
  createCake,
  createCartWithItem,
  createOrder,
  createReview,
  auth,
  objectId: () => new mongoose.Types.ObjectId(),
};

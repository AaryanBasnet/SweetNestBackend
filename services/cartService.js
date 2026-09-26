/**
 * Cart operations.
 *
 * The rule this file exists to protect: a cart line is priced from the
 * catalogue, never from the request. A client may say which cake and which
 * weight it wants; it may not say what that costs.
 *
 * That rule used to be implemented twice - once in addToCart and again in
 * syncCart - with slightly different handling of the quantity cap. Duplicated
 * pricing logic is how a cart ends up charging two different amounts for the
 * same thing depending on which endpoint the client happened to call.
 */

const Cart = require("../model/Cart");
const Cake = require("../model/Cake");
const pricing = require("./pricingService");
const { badRequest, notFound } = require("../utils/AppError");

const MAX_QUANTITY = pricing.config.MAX_QUANTITY_PER_ITEM;

const CAKE_FIELDS = "name slug images weightOptions basePrice isActive category";

/** Find a user's cart, creating an empty one if they have never had one. */
const getOrCreateCart = async (userId) => {
  const existing = await Cart.findOne({ user: userId });
  if (existing) return existing;
  return Cart.create({ user: userId, items: [] });
};

/**
 * Turn "this cake, this weight" into a priced cart line.
 *
 * The price comes from the matched weight option on the cake document. The
 * caller's `selectedWeight` is used only to choose WHICH option - its price
 * and label are ignored entirely.
 */
const buildCartLine = (cake, selectedWeight, quantity, customization) => {
  const weightOption = cake.weightOptions.find(
    (option) => option.weightInKg === selectedWeight?.weightInKg
  );

  if (!weightOption) {
    throw badRequest("Invalid weight option");
  }

  return {
    cake: cake._id,
    quantity,
    selectedWeight: {
      weightInKg: weightOption.weightInKg,
      label: weightOption.label,
      price: weightOption.price, // from the database, never from the request
    },
    customization,
  };
};

/** Where in the cart is this cake at this weight, if at all? */
const findLineIndex = (cart, cakeId, weightInKg) =>
  cart.items.findIndex(
    (item) =>
      item.cake.toString() === cakeId.toString() &&
      item.selectedWeight.weightInKg === weightInKg
  );

/**
 * The response shape every cart endpoint returns.
 *
 * Centralised so the cart page, the header badge and the checkout summary
 * cannot be handed subtly different fields.
 */
const toCartResponse = (cart, items = cart.items) => ({
  items,
  itemCount: cart.itemCount,
  subtotal: cart.subtotal,
  shipping: cart.shipping,
  discountAmount: cart.discountAmount,
  tax: cart.tax,
  total: cart.total,
  deliveryType: cart.deliveryType,
  promoCode: cart.promoCode?.code || null,
});

const populateCart = (cart) =>
  cart.populate({
    path: "items.cake",
    select: CAKE_FIELDS,
    populate: { path: "category", select: "name slug" },
  });

// ---------------------------------------------------------------------------

/**
 * Read the cart, dropping anything that is no longer buyable.
 *
 * A cake can be deactivated while it sits in someone's cart. Leaving it there
 * means the customer reaches checkout and is told no; removing it here means
 * the cart always reflects what can actually be ordered.
 */
const getCart = async (userId) => {
  const cart = await getOrCreateCart(userId);
  await populateCart(cart);

  const activeItems = cart.items.filter((item) => item.cake && item.cake.isActive);

  if (activeItems.length !== cart.items.length) {
    cart.items = activeItems;
    await cart.save();
  }

  return toCartResponse(cart, activeItems);
};

const addItem = async (userId, { cakeId, quantity = 1, selectedWeight, customization }) => {
  const cake = await Cake.findOne({ _id: cakeId, isActive: true });
  if (!cake) {
    throw notFound("Cake not found or unavailable");
  }

  const line = buildCartLine(cake, selectedWeight, quantity, customization);
  const cart = await getOrCreateCart(userId);

  const existingIndex = findLineIndex(cart, cakeId, line.selectedWeight.weightInKg);

  if (existingIndex > -1) {
    const newQuantity = cart.items[existingIndex].quantity + quantity;

    if (newQuantity > MAX_QUANTITY) {
      throw badRequest(`Maximum quantity is ${MAX_QUANTITY}`);
    }

    cart.items[existingIndex].quantity = newQuantity;
  } else {
    if (quantity > MAX_QUANTITY) {
      throw badRequest(`Maximum quantity is ${MAX_QUANTITY}`);
    }
    cart.items.push(line);
  }

  await cart.save();
  await populateCart(cart);

  return toCartResponse(cart);
};

const updateItemQuantity = async (userId, itemId, quantity) => {
  if (quantity < 1 || quantity > MAX_QUANTITY) {
    throw badRequest(`Quantity must be between 1 and ${MAX_QUANTITY}`);
  }

  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw notFound("Cart not found");

  const item = cart.items.id(itemId);
  if (!item) throw notFound("Item not in cart");

  item.quantity = quantity;
  await cart.save();
  await populateCart(cart);

  return toCartResponse(cart);
};

const removeItem = async (userId, itemId) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw notFound("Cart not found");

  const index = cart.items.findIndex((item) => item._id.toString() === itemId);
  if (index === -1) throw notFound("Item not in cart");

  cart.items.splice(index, 1);
  await cart.save();
  await populateCart(cart);

  return toCartResponse(cart);
};

/**
 * Merge a guest cart (held in the browser) into the account's cart on login.
 *
 * Unknown cakes, inactive cakes and invalid weights are skipped rather than
 * rejected: a sign-in should not fail because something in an old browser
 * cart was discontinued last week.
 *
 * The cake lookups are batched. The previous version queried the database
 * once per item inside the loop, so merging a ten-item cart meant eleven
 * round trips.
 */
const syncCart = async (userId, items) => {
  if (!Array.isArray(items)) {
    throw badRequest("Items must be an array");
  }

  const cart = await getOrCreateCart(userId);

  const ids = [...new Set(items.map((item) => item?.cakeId).filter(Boolean))];
  const cakes = await Cake.find({ _id: { $in: ids }, isActive: true });
  const cakesById = new Map(cakes.map((cake) => [cake._id.toString(), cake]));

  for (const incoming of items) {
    const cake = cakesById.get(String(incoming?.cakeId));
    if (!cake) continue;

    let line;
    try {
      line = buildCartLine(
        cake,
        incoming.selectedWeight,
        incoming.quantity || 1,
        incoming.customization
      );
    } catch {
      continue; // weight no longer offered - skip rather than fail the sync
    }

    const existingIndex = findLineIndex(cart, cake._id, line.selectedWeight.weightInKg);

    if (existingIndex > -1) {
      cart.items[existingIndex].quantity = Math.min(
        MAX_QUANTITY,
        cart.items[existingIndex].quantity + (incoming.quantity || 1)
      );
    } else {
      line.quantity = Math.min(MAX_QUANTITY, line.quantity);
      cart.items.push(line);
    }
  }

  await cart.save();
  await populateCart(cart);

  return toCartResponse(cart);
};

const clearCart = async (userId) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw notFound("Cart not found");

  cart.items = [];
  cart.promoCode = null;
  await cart.save();

  return toCartResponse(cart);
};

const setDeliveryType = async (userId, deliveryType) => {
  if (!["delivery", "pickup"].includes(deliveryType)) {
    throw badRequest("Delivery type must be either delivery or pickup");
  }

  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw notFound("Cart not found");

  cart.deliveryType = deliveryType;
  await cart.save();

  return toCartResponse(cart);
};

const removePromoCode = async (userId) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw notFound("Cart not found");

  cart.promoCode = null;
  await cart.save();

  return toCartResponse(cart);
};

module.exports = {
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
  syncCart,
  clearCart,
  setDeliveryType,
  removePromoCode,
  getOrCreateCart,
  toCartResponse,
  buildCartLine,
};

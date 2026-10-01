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

/**
 * Find a user's cart, creating an empty one if they have never had one.
 *
 * Upsert, not find-then-create: a brand new user clicking "add to cart"
 * twice in quick succession (a double click, or two tabs) fires this
 * concurrently with no cart yet to find, so a separate find and create left
 * a gap where both requests could see "nothing exists" and both try to
 * create one - caught at the database by the unique index on `user`, but as
 * an unhandled duplicate-key error, which reached the customer as an
 * unexplained failure rather than a cart.
 *
 * The upsert collapses find-and-create into one request. The catch handles
 * a documented MongoDB caveat: two concurrent upserts against the same
 * unique key can still both attempt an insert and have the loser's insert
 * rejected as a duplicate, even though the index is doing exactly its job -
 * the loser just re-fetches the document the winner created.
 */
const getOrCreateCart = async (userId) => {
  try {
    return await Cart.findOneAndUpdate(
      { user: userId },
      { $setOnInsert: { user: userId, items: [] } },
      { upsert: true, returnDocument: "after" }
    );
  } catch (error) {
    if (error.code === 11000) {
      return Cart.findOne({ user: userId });
    }
    throw error;
  }
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

/**
 * Atomically increment quantity on an existing matching line, but only if
 * doing so would not exceed MAX_QUANTITY.
 *
 * The cap is enforced by the query filter itself - `quantity: { $lte:
 * MAX_QUANTITY - quantityToAdd }` - not by reading a value and checking it in
 * application code. That is what makes this safe under concurrency: MongoDB
 * serializes writes to a single document, so whichever request's update
 * lands first is evaluated against the real stored quantity, and the second
 * request's filter is then checked against the value the first one just
 * wrote - never against a value either of them merely read earlier.
 *
 * Returns the updated cart if a matching line existed and fit under the cap.
 * Returns null in two different situations on purpose: no matching line
 * exists at all, or a matching line exists but is already at (or would
 * exceed) the cap. addItem below is what tells those apart - see its comment.
 */
const incrementExistingLine = async (userId, cakeId, weightInKg, quantityToAdd) =>
  Cart.findOneAndUpdate(
    {
      user: userId,
      items: {
        $elemMatch: {
          cake: cakeId,
          "selectedWeight.weightInKg": weightInKg,
          quantity: { $lte: MAX_QUANTITY - quantityToAdd },
        },
      },
    },
    { $inc: { "items.$.quantity": quantityToAdd } },
    { returnDocument: "after" }
  );

/**
 * Read-only lookup of a matching line, regardless of its quantity. Used only
 * to turn a null from incrementExistingLine into the right outcome: if a
 * line exists here, incrementExistingLine's null meant "at capacity", not
 * "no line yet".
 */
const findMatchingLine = async (userId, cakeId, weightInKg) => {
  const cart = await Cart.findOne(
    {
      user: userId,
      items: { $elemMatch: { cake: cakeId, "selectedWeight.weightInKg": weightInKg } },
    },
    { "items.$": 1 }
  );
  return cart ? cart.items[0] : null;
};

/**
 * Atomically push a new line, but only if no matching line exists yet. The
 * existence check and the push happen as one database write, so two
 * concurrent requests that both missed incrementExistingLine cannot both
 * succeed here - only the first to reach the database wins; the second's
 * filter no longer matches (the line now exists) and it gets null back.
 */
const pushNewLineIfAbsent = async (userId, line) => {
  return Cart.findOneAndUpdate(
    {
      user: userId,
      items: {
        $not: {
          $elemMatch: {
            cake: line.cake,
            "selectedWeight.weightInKg": line.selectedWeight.weightInKg,
          },
        },
      },
    },
    { $push: { items: line } },
    { returnDocument: "after" }
  );
};

/**
 * Add a cake to the cart, safe under concurrent identical requests.
 *
 * Previously this read the cart, decided in application code whether a
 * matching line existed, and wrote the result back - a classic
 * read-modify-write gap. Confirmed via a concurrency test
 * (scripts/race-test-cart-quantity.js): 5 simultaneous "add 1" requests for
 * the same cake+weight produced 5 separate duplicate lines instead of one
 * line with quantity 5, because every request read the cart before any of
 * them had written back.
 *
 * The fix tries an atomic capped increment first, falls back to an atomic
 * conditional push if no line existed, and retries a few times for the rare
 * case both attempts lose a tight race against a third request. If every
 * attempt is exhausted, a final read distinguishes "the cap was genuinely
 * hit" (reject with the same message a sequential request would have gotten)
 * from "something stayed inconsistent" (ask the caller to retry).
 */
const addItem = async (userId, { cakeId, quantity = 1, selectedWeight, customization }) => {
  const cake = await Cake.findOne({ _id: cakeId, isActive: true });
  if (!cake) {
    throw notFound("Cake not found or unavailable");
  }

  // A single request can never legally add more than the cap in one go,
  // whether or not a line already exists for this cake and weight - reject
  // up front rather than spending a database round trip on a request that
  // cannot succeed either way.
  if (quantity > MAX_QUANTITY) {
    throw badRequest(`Maximum quantity is ${MAX_QUANTITY}`);
  }

  const line = buildCartLine(cake, selectedWeight, quantity, customization);
  const weightInKg = line.selectedWeight.weightInKg;

  await getOrCreateCart(userId); // ensure a cart document exists before the atomic ops below

  const MAX_ATTEMPTS = 3;
  let cart = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && !cart; attempt++) {
    cart = await incrementExistingLine(userId, cake._id, weightInKg, quantity);
    if (cart) break;

    cart = await pushNewLineIfAbsent(userId, line);
    // Both null: either a concurrent request just created the line (the
    // next loop iteration's increment will find it), or the existing line
    // is already at capacity. Resolved below once retries are exhausted.
  }

  if (!cart) {
    const existingLine = await findMatchingLine(userId, cake._id, weightInKg);

    if (existingLine) {
      // A line is there and incrementExistingLine still would not take it -
      // the cap was genuinely hit. Same message and status a sequential
      // request would have gotten; concurrency did not change the outcome,
      // only how it had to be computed.
      throw badRequest(`Maximum quantity is ${MAX_QUANTITY}`);
    }

    throw badRequest("Could not update cart - please try again");
  }

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
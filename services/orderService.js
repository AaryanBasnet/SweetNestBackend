/**
 * Order creation.
 *
 * Turning a cart into an order is the single most consequential operation in
 * the application: it is the moment a browsing session becomes money owed. It
 * used to live inline in a request handler, mixed in with reading req.body and
 * shaping the JSON response, which made it impossible to call from anywhere
 * else and easy to get subtly wrong.
 */

const Cart = require("../model/Cart");
const Order = require("../model/Order");
const pricing = require("./pricingService");
const discountService = require("./discountService");
const logger = require("../config/logger");
const { badRequest } = require("../utils/AppError");

const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // stale-lock fallback if a request crashes mid-checkout

/**
 * Atomically claim the cart for checkout. Only one concurrent request for a
 * given user can win this — everyone else gets null back immediately,
 * before any pricing or coupon logic runs. This is what actually closes the
 * race: there is no longer a window where two requests both see an unused
 * coupon or an intact cart at the same time.
 *
 * Found via a concurrency test (scripts/race-test-coupon.js): 10 simultaneous
 * checkout requests against one cart with one coupon produced 8 separate
 * orders, all carrying the discount — Rs 880 given away from a coupon meant
 * to be used once. The coupon's own findOneAndUpdate guard correctly allowed
 * only one usedInOrder, but by then the discount was already baked into
 * every racing order. Locking the cart itself, before any pricing happens,
 * closes both the discount leak and the duplicate-order issue at the source.
 */
const claimCartForCheckout = async (userId) => {
  const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);

  return Cart.findOneAndUpdate(
    {
      user: userId,
      "items.0": { $exists: true }, // non-empty
      $or: [
        { checkoutLock: { $ne: true } },
        { checkoutLockAt: { $lt: staleBefore } }, // abandoned lock, safe to reclaim
      ],
    },
    { $set: { checkoutLock: true, checkoutLockAt: new Date() } },
    { new: true }
  ).populate({ path: "items.cake", select: "name images slug" });
};

const releaseCheckoutLock = (userId) =>
  Cart.findOneAndUpdate({ user: userId }, { $set: { checkoutLock: false } });

/**
 * Build the order line for a cake that exists in the catalogue.
 *
 * Note that name, image and price are COPIED onto the order rather than
 * referenced. An order is a historical record of what was agreed: if the
 * bakery renames a cake or raises its price next week, last week's order must
 * still show what the customer actually bought and paid.
 */
const buildCatalogueItem = (item) => ({
  cake: item.cake._id,
  name: item.cake.name,
  image: item.cake.images?.[0]?.url || "",
  quantity: item.quantity,
  weight: {
    weightInKg: item.selectedWeight.weightInKg,
    label: item.selectedWeight.label,
    price: item.selectedWeight.price,
  },
  isCustom: false,
  customizations: item.customization
    ? [
        {
          name: "Custom Message",
          selectedOption: item.customization.message || "",
          priceAdjustment: 0,
        },
      ]
    : [],
  itemTotal: pricing.lineTotal(item),
});

/** Build the order line for a cake the customer designed in the configurator. */
const buildCustomItem = (item) => {
  const customization = item.customization || {};

  return {
    cake: null, // not a catalogue product
    name: customization.name || `Custom ${customization.flavor} Cake`,
    image: customization.previewImage || "",
    quantity: item.quantity,
    weight: {
      weightInKg: item.selectedWeight.weightInKg,
      label: item.selectedWeight.label || `${item.selectedWeight.weightInKg}kg`,
      price: item.selectedWeight.price,
    },
    isCustom: true,
    customizations: [
      {
        name: "Custom Cake Design",
        details: {
          tiers: customization.tiers,
          size: customization.size,
          flavor: customization.flavor,
          frostingColor: customization.color,
          frostingColorHex: customization.frostingColorHex,
          topper: customization.topper,
          topperPrice: customization.topperPrice || 0,
          message: customization.message || "",
        },
        priceAdjustment: customization.topperPrice || 0,
      },
    ],
    itemTotal: pricing.lineTotal(item),
  };
};

const buildOrderItems = (cartItems) =>
  cartItems.map((item) =>
    !item.cake || !item.cake._id ? buildCustomItem(item) : buildCatalogueItem(item)
  );

/**
 * Create an order from the user's current cart.
 *
 * Takes a user id and the delivery details the customer supplied. It never
 * takes prices: those come from the cart, which took them from the catalogue.
 * A caller cannot name its own total, whatever it puts in the request body.
 *
 * The cart is claimed atomically before anything else happens (see
 * claimCartForCheckout above) — this is what makes "one coupon, one order"
 * actually true under concurrent requests, not just true in the common case.
 */
const createOrderFromCart = async (userId, details) => {
  const cart = await claimCartForCheckout(userId);

  if (!cart) {
    throw badRequest("Your cart is empty, or a checkout is already in progress");
  }

  try {
    const {
      contactEmail,
      shippingAddress,
      deliverySchedule,
      specialRequests,
      subscribeNewsletter,
      paymentMethod,
    } = details;

    // One calculation, shared with the cart the customer was just looking
    // at, so the total on the confirmation screen cannot disagree with the
    // total they were shown.
    const totals = pricing.calculateTotals({
      items: cart.items,
      deliveryType: cart.deliveryType,
      promoCode: cart.promoCode,
    });

    const order = await Order.create({
      orderNumber: await Order.generateOrderNumber(),
      user: userId,
      items: buildOrderItems(cart.items),
      shippingAddress,
      contactEmail,
      deliverySchedule: {
        date: new Date(deliverySchedule.date),
        timeSlot: deliverySchedule.timeSlot,
      },
      specialRequests,
      subscribeNewsletter,
      paymentMethod,
      paymentStatus: "pending",
      orderStatus: paymentMethod === "cod" ? "confirmed" : "pending",
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      discount: totals.discount,
      total: totals.total,
      promoCode: cart.promoCode || null,
    });

    // Consume the coupon, if one was applied. With the checkout lock above,
    // this should now only ever run once per coupon in practice — kept as a
    // defense-in-depth safety net, and as a signal if that assumption is
    // ever violated by a future code change.
    if (cart.promoCode?.couponId) {
      const consumed = await discountService.consumeCoupon(
        cart.promoCode.couponId,
        order._id
      );

      if (!consumed) {
        logger.warn(
          {
            orderId: order._id,
            couponId: cart.promoCode.couponId,
            userId,
          },
          "Coupon could not be consumed - it may have been used already"
        );
      }
    }

    // For cash on delivery the sale is done, so the cart is cleared now.
    // Clearing it also resets checkoutLock, so nothing is left for a stray
    // request to reclaim. For eSewa the cart survives until payment
    // actually settles (so a failed payment doesn't leave the customer with
    // nothing to retry) but the lock still has to be released explicitly,
    // or every future checkout attempt for this user would be rejected as
    // "already in progress".
    if (paymentMethod === "cod") {
      await Cart.findOneAndUpdate(
        { user: userId },
        { items: [], promoCode: null, checkoutLock: false }
      );
    } else {
      await releaseCheckoutLock(userId);
    }

    await order.populate("user", "name email");

    logger.info(
      {
        orderId: order._id,
        orderNumber: order.orderNumber,
        userId,
        total: order.total,
        paymentMethod,
      },
      "Order created"
    );

    return order;
  } catch (err) {
    // Don't leave the cart permanently locked if anything above throws —
    // otherwise a single failed checkout would lock the user out of ever
    // checking out again until the stale-lock timeout passes.
    await releaseCheckoutLock(userId);
    throw err;
  }
};

module.exports = {
  createOrderFromCart,
  // exported for tests
  buildOrderItems,
};
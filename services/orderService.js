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
 */
const createOrderFromCart = async (userId, details) => {
  const cart = await Cart.findOne({ user: userId }).populate({
    path: "items.cake",
    select: "name images slug",
  });

  if (!cart || cart.items.length === 0) {
    throw badRequest("Your cart is empty");
  }

  const {
    contactEmail,
    shippingAddress,
    deliverySchedule,
    specialRequests,
    subscribeNewsletter,
    paymentMethod,
  } = details;

  // One calculation, shared with the cart the customer was just looking at,
  // so the total on the confirmation screen cannot disagree with the total
  // they were shown.
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

  // Consume the coupon, if one was applied.
  //
  // Nothing did this before. couponId was assigned to cart.promoCode but the
  // schema dropped it, and no code path ever set isUsed - so a coupon earned
  // once with reward points could be spent on an unlimited number of orders.
  if (cart.promoCode?.couponId) {
    const consumed = await discountService.consumeCoupon(
      cart.promoCode.couponId,
      order._id
    );

    if (!consumed) {
      // Lost a race, or it was already spent. The order stands - refusing it
      // after the customer has committed would be worse - but this needs to
      // be visible, because it means someone got a discount twice.
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

  // For cash on delivery the sale is done, so the cart is cleared now. For
  // eSewa the cart survives until payment actually settles, so a failed
  // payment does not leave the customer with nothing to retry.
  if (paymentMethod === "cod") {
    await Cart.findOneAndUpdate({ user: userId }, { items: [], promoCode: null });
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
};

module.exports = {
  createOrderFromCart,
  // exported for tests
  buildOrderItems,
};

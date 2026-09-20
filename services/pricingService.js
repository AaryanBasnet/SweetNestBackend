/**
 * Pricing.
 *
 * Every number a customer is charged is computed here and nowhere else.
 *
 * Why this file exists
 * --------------------
 * Pricing used to live in three places that did not agree with each other:
 * shipping was hardcoded in a Cart virtual, promo codes were a literal object
 * inside cartController, and the discount cap was written to a schema field
 * that did not exist - so it was silently dropped and never applied. A coupon
 * advertised as "20% off, up to Rs 200" gave Rs 2,000 off a Rs 10,000 order.
 *
 * That bug was not a typo. It was the predictable result of one calculation
 * being spread across a model, a controller and a schema. Rules that decide
 * money belong in one place, with tests.
 *
 * Everything here is a pure function: no database, no request, no side
 * effects. That makes each rule testable in microseconds and means the same
 * code can price a cart, price an order, or answer a "what would this cost"
 * question without any of them drifting apart.
 */

// ---------------------------------------------------------------------------
// Configuration
//
// Env-overridable so a price change does not require a code change. Defaults
// preserve the behaviour these rules replaced.
// ---------------------------------------------------------------------------

const DELIVERY_FEE = Number(process.env.DELIVERY_FEE ?? 100);
const FREE_DELIVERY_THRESHOLD = Number(
  process.env.FREE_DELIVERY_THRESHOLD ?? Infinity
);

/**
 * Tax rate as a fraction (0.13 would be 13% VAT).
 *
 * Defaults to 0, which keeps current behaviour exactly. The line exists so
 * that adding tax later is a config change in one place rather than an
 * archaeology expedition through every total in the codebase.
 */
const TAX_RATE = Number(process.env.TAX_RATE ?? 0);

const MAX_QUANTITY_PER_ITEM = 10;

/**
 * Round to 2 decimal places.
 *
 * Money is held as a Number (rupees) rather than integer paisa, which is not
 * what you would choose from scratch - 0.1 + 0.2 is famously not 0.3 in
 * binary floating point. Changing the representation now would mean migrating
 * every stored order, so instead every computed figure is rounded here, at
 * the single point where money is produced. If this app ever handles serious
 * volume, integer paisa is the correct fix.
 */
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Never return a negative amount to a customer. */
const atLeastZero = (value) => (value > 0 ? value : 0);

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

/**
 * Price of a single line: unit price x quantity.
 * Tolerates a missing price or quantity rather than producing NaN, which
 * would render to the customer as "Rs NaN".
 */
const lineTotal = (item) => {
  const price = Number(item?.selectedWeight?.price) || 0;
  const quantity = Number(item?.quantity) || 1;
  return round(price * quantity);
};

const calculateSubtotal = (items = []) =>
  round(items.reduce((sum, item) => sum + lineTotal(item), 0));

const countItems = (items = []) =>
  items.reduce((count, item) => count + (Number(item?.quantity) || 1), 0);

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

/**
 * Pickup is always free. Delivery costs the flat fee, unless the order is
 * large enough to qualify for free delivery (disabled by default).
 */
const calculateShipping = (deliveryType, subtotal = 0) => {
  if (deliveryType === "pickup") return 0;
  if (subtotal >= FREE_DELIVERY_THRESHOLD) return 0;
  return DELIVERY_FEE;
};

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

/**
 * Work out what a promo or coupon takes off.
 *
 * promo: { discountType: 'percentage' | 'fixed', discount, maxDiscount? }
 *
 * Rules, all of which exist because breaking one costs real money:
 *  - a percentage applies to the SUBTOTAL only, never to shipping
 *  - maxDiscount caps a percentage discount (this is the rule that was
 *    silently dropped before)
 *  - a discount can never exceed the subtotal, so a large fixed coupon on a
 *    small order cannot make the shop pay the customer
 */
const calculateDiscount = (subtotal, promo) => {
  if (!promo || !promo.code) return 0;

  const value = Number(promo.discount);
  if (!Number.isFinite(value) || value <= 0) return 0;

  let discount;

  if (promo.discountType === "percentage") {
    discount = (subtotal * value) / 100;

    const cap = Number(promo.maxDiscount);
    if (Number.isFinite(cap) && cap > 0 && discount > cap) {
      discount = cap;
    }
  } else {
    discount = value;
  }

  // Never discount more than the goods are worth.
  if (discount > subtotal) discount = subtotal;

  return round(atLeastZero(discount));
};

// ---------------------------------------------------------------------------
// Tax
// ---------------------------------------------------------------------------

/** Tax applies to the discounted goods value, not to shipping. */
const calculateTax = (taxableAmount) => round(atLeastZero(taxableAmount) * TAX_RATE);

// ---------------------------------------------------------------------------
// The whole bill
// ---------------------------------------------------------------------------

/**
 * The single entry point. Give it what was bought and how it is being
 * delivered, and it returns every figure the customer sees.
 *
 * Returning the full breakdown rather than just a total matters: the cart,
 * the checkout summary, the order record and the payment amount then all
 * quote the same numbers by construction, instead of each recomputing them
 * slightly differently.
 */
const calculateTotals = ({ items = [], deliveryType = "delivery", promoCode = null } = {}) => {
  const subtotal = calculateSubtotal(items);
  const shipping = calculateShipping(deliveryType, subtotal);
  const discount = calculateDiscount(subtotal, promoCode);
  const tax = calculateTax(subtotal - discount);

  const total = round(atLeastZero(subtotal - discount + shipping + tax));

  return {
    subtotal,
    shipping,
    discount,
    tax,
    total,
    itemCount: countItems(items),
  };
};

/**
 * Is this promo allowed on this order at all?
 * Separate from calculateDiscount because "you cannot use this code" is a
 * message for the customer, while the calculation is just arithmetic.
 */
const checkMinimumOrder = (subtotal, minOrderAmount) => {
  const minimum = Number(minOrderAmount) || 0;
  if (subtotal >= minimum) return { ok: true };

  return {
    ok: false,
    minimum,
    message: `Minimum order amount of Rs. ${minimum} required for this code`,
  };
};

module.exports = {
  calculateSubtotal,
  calculateShipping,
  calculateDiscount,
  calculateTax,
  calculateTotals,
  checkMinimumOrder,
  countItems,
  lineTotal,
  round,
  config: {
    DELIVERY_FEE,
    FREE_DELIVERY_THRESHOLD,
    TAX_RATE,
    MAX_QUANTITY_PER_ITEM,
  },
};

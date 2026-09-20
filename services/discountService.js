/**
 * Discount codes.
 *
 * Answers one question: what, if anything, does this code give this customer
 * on this order?
 *
 * Two kinds of code exist and they used to be handled by two separate stretches
 * of logic inside cartController:
 *
 *   - COUPONS are earned. A customer redeems reward points for one, it belongs
 *     to them alone, it expires, and it can be used exactly once.
 *   - PROMO CODES are public. Anyone may use them, they do not expire, and
 *     they are not tied to an account.
 *
 * Keeping the distinction in one file means the validation rules cannot drift
 * apart - which is how a coupon's maxDiscount came to be read in one branch
 * and forgotten in the other.
 */

const Coupon = require("../model/Coupon");
const pricing = require("./pricingService");
const { badRequest } = require("../utils/AppError");

/**
 * Public promo codes.
 *
 * These were a literal object inside a request handler. Moving them here is
 * an improvement, not the destination: they still cannot be changed without a
 * deploy, and there is no way to schedule, limit or retire one.
 *
 * The proper home is the database with an admin screen, the same way
 * Promotions already work. Doing that is a self-contained next task; this
 * structure is deliberately shaped to make it a drop-in replacement, since
 * only resolvePromoCode below would need to change.
 */
const PROMO_CODES = {
  SWEET10: {
    discountType: "percentage",
    discount: 10,
    minOrderAmount: 500,
  },
  FLAT50: {
    discountType: "fixed",
    discount: 50,
    minOrderAmount: 1000,
  },
  WELCOME20: {
    discountType: "percentage",
    discount: 20,
    minOrderAmount: 800,
    // Previously declared and silently discarded, because the Cart schema had
    // no such field. It now survives the round trip and is enforced.
    maxDiscount: 200,
  },
};

const normaliseCode = (code) => String(code || "").trim().toUpperCase();

/**
 * A coupon this specific user earned.
 * Returns null when the code is not one of their coupons, so the caller can
 * fall through to the public codes.
 */
const resolveCoupon = async (code, userId) => {
  const coupon = await Coupon.findOne({ code, user: userId });
  if (!coupon) return null;

  if (coupon.isUsed) {
    throw badRequest("This coupon has already been used");
  }

  if (new Date(coupon.expiresAt) <= new Date()) {
    throw badRequest("This coupon has expired");
  }

  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discount: coupon.discountValue,
    maxDiscount: coupon.maxDiscount,
    minOrderAmount: coupon.minOrderAmount,
    // Carried through so the order can consume the coupon on checkout.
    couponId: coupon._id,
    isCoupon: true,
  };
};

/** A public promo code. */
const resolvePromoCode = (code) => {
  const promo = PROMO_CODES[code];
  if (!promo) return null;

  return {
    code,
    discountType: promo.discountType,
    discount: promo.discount,
    maxDiscount: promo.maxDiscount,
    minOrderAmount: promo.minOrderAmount,
    couponId: undefined,
    isCoupon: false,
  };
};

/**
 * Resolve a code and confirm the order qualifies for it.
 *
 * Returns the shape that goes straight onto cart.promoCode. Throws an
 * AppError the customer can be shown when the code is unusable.
 */
const resolveDiscountCode = async ({ code, userId, subtotal }) => {
  const normalised = normaliseCode(code);

  if (!normalised) {
    throw badRequest("Promo code is required");
  }

  // Coupons first: a customer's own coupon should win over a public code that
  // happens to share its name.
  const resolved =
    (await resolveCoupon(normalised, userId)) || resolvePromoCode(normalised);

  if (!resolved) {
    throw badRequest("Invalid promo code");
  }

  const minimum = pricing.checkMinimumOrder(subtotal, resolved.minOrderAmount);
  if (!minimum.ok) {
    throw badRequest(minimum.message);
  }

  return resolved;
};

/**
 * Consume a coupon once an order is placed.
 *
 * The conditional update is deliberate: it is what makes "used exactly once"
 * true under concurrency. Checking isUsed and then saving would let two
 * simultaneous checkouts both read false and both succeed.
 *
 * Returns true if this call was the one that consumed it.
 */
const consumeCoupon = async (couponId, orderId) => {
  if (!couponId) return false;

  const consumed = await Coupon.findOneAndUpdate(
    { _id: couponId, isUsed: false },
    { $set: { isUsed: true, usedAt: new Date(), usedInOrder: orderId } },
    { returnDocument: "after" }
  );

  return Boolean(consumed);
};

module.exports = {
  resolveDiscountCode,
  consumeCoupon,
  normaliseCode,
  // exported for tests and for the eventual move to database-backed codes
  PROMO_CODES,
};

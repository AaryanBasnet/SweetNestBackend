/**
 * Pricing tests.
 *
 * This is the most heavily tested file in the repository on purpose: every
 * rule here decides what a real person is charged, and two of these tests
 * exist because the rule they cover was silently broken in production.
 *
 * All pure functions, no database - the whole file runs in milliseconds.
 */

const pricing = require("../services/pricingService");

const {
  calculateSubtotal,
  calculateShipping,
  calculateDiscount,
  calculateTotals,
  checkMinimumOrder,
  countItems,
  lineTotal,
} = pricing;

/** A cart line, priced like the database prices it. */
const item = (price, quantity = 1) => ({
  selectedWeight: { weightInKg: 1, label: "1 kg", price },
  quantity,
});

describe("lineTotal", () => {
  it("multiplies unit price by quantity", () => {
    expect(lineTotal(item(1200, 3))).toBe(3600);
  });

  it("treats a missing quantity as one", () => {
    expect(lineTotal({ selectedWeight: { price: 500 } })).toBe(500);
  });

  // A NaN reaching the UI renders as "Rs NaN", which looks broken to the
  // customer in a way a wrong number does not.
  it("never produces NaN from malformed input", () => {
    expect(lineTotal({})).toBe(0);
    expect(lineTotal(null)).toBe(0);
    expect(lineTotal({ selectedWeight: {}, quantity: 2 })).toBe(0);
  });
});

describe("calculateSubtotal", () => {
  it("is zero for an empty cart", () => {
    expect(calculateSubtotal([])).toBe(0);
    expect(calculateSubtotal()).toBe(0);
  });

  it("sums every line", () => {
    expect(calculateSubtotal([item(1200, 2), item(2200, 1)])).toBe(4600);
  });

  it("rounds to two decimal places", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point.
    expect(calculateSubtotal([item(0.1), item(0.2)])).toBe(0.3);
  });
});

describe("countItems", () => {
  it("counts units, not lines", () => {
    expect(countItems([item(100, 2), item(200, 3)])).toBe(5);
  });
});

describe("calculateShipping", () => {
  it("charges the flat fee for delivery", () => {
    expect(calculateShipping("delivery", 500)).toBe(100);
  });

  it("is free for pickup", () => {
    expect(calculateShipping("pickup", 500)).toBe(0);
  });

  it("is free for pickup regardless of order size", () => {
    expect(calculateShipping("pickup", 0)).toBe(0);
    expect(calculateShipping("pickup", 999999)).toBe(0);
  });

  it("defaults to charging when the delivery type is unknown", () => {
    // Fail closed: charging and being corrected beats silently shipping free.
    expect(calculateShipping(undefined, 500)).toBe(100);
    expect(calculateShipping("teleportation", 500)).toBe(100);
  });
});

describe("calculateDiscount", () => {
  it("is zero with no promo", () => {
    expect(calculateDiscount(1000, null)).toBe(0);
    expect(calculateDiscount(1000, {})).toBe(0);
  });

  it("applies a percentage discount", () => {
    expect(
      calculateDiscount(1000, {
        code: "SWEET10",
        discountType: "percentage",
        discount: 10,
      })
    ).toBe(100);
  });

  it("applies a fixed discount", () => {
    expect(
      calculateDiscount(1000, {
        code: "FLAT50",
        discountType: "fixed",
        discount: 50,
      })
    ).toBe(50);
  });

  // ==========================================================================
  // The regression test for a bug that was live.
  //
  // maxDiscount was assigned to cart.promoCode, but the Cart schema never
  // declared the field, so Mongoose dropped it on save. WELCOME20 is
  // advertised as "20% off, up to Rs 200" and was giving Rs 2,000 off a
  // Rs 10,000 order - ten times its intended value.
  // ==========================================================================
  it("caps a percentage discount at maxDiscount", () => {
    const discount = calculateDiscount(10000, {
      code: "WELCOME20",
      discountType: "percentage",
      discount: 20,
      maxDiscount: 200,
    });

    expect(discount).toBe(200); // not 2000
  });

  it("does not apply the cap when the discount is already under it", () => {
    expect(
      calculateDiscount(500, {
        code: "WELCOME20",
        discountType: "percentage",
        discount: 20,
        maxDiscount: 200,
      })
    ).toBe(100);
  });

  it("ignores a cap on a fixed discount", () => {
    // A fixed amount is already its own cap.
    expect(
      calculateDiscount(1000, {
        code: "FLAT50",
        discountType: "fixed",
        discount: 50,
        maxDiscount: 10,
      })
    ).toBe(50);
  });

  // Without this, a Rs 500 coupon on a Rs 100 order makes the shop owe money.
  it("never discounts more than the goods are worth", () => {
    expect(
      calculateDiscount(100, {
        code: "FLAT500",
        discountType: "fixed",
        discount: 500,
      })
    ).toBe(100);
  });

  it("ignores a malformed or negative discount", () => {
    const base = { code: "X", discountType: "percentage" };
    expect(calculateDiscount(1000, { ...base, discount: undefined })).toBe(0);
    expect(calculateDiscount(1000, { ...base, discount: -50 })).toBe(0);
    expect(calculateDiscount(1000, { ...base, discount: "abc" })).toBe(0);
  });

  it("ignores a promo with no code", () => {
    expect(
      calculateDiscount(1000, { discountType: "percentage", discount: 50 })
    ).toBe(0);
  });
});

describe("calculateTotals", () => {
  it("is shipping only for an empty cart", () => {
    expect(calculateTotals({ items: [] })).toMatchObject({
      subtotal: 0,
      shipping: 100,
      discount: 0,
      total: 100,
    });
  });

  it("adds shipping to the subtotal", () => {
    expect(calculateTotals({ items: [item(1200)] })).toMatchObject({
      subtotal: 1200,
      shipping: 100,
      total: 1300,
    });
  });

  it("omits shipping for pickup", () => {
    expect(
      calculateTotals({ items: [item(1200)], deliveryType: "pickup" })
    ).toMatchObject({ shipping: 0, total: 1200 });
  });

  // A customer who gets 10% off should not also get 10% off the courier.
  it("applies a percentage discount to goods only, never to shipping", () => {
    const totals = calculateTotals({
      items: [item(1000)],
      promoCode: { code: "SWEET10", discountType: "percentage", discount: 10 },
    });

    expect(totals.discount).toBe(100);
    expect(totals.shipping).toBe(100);
    expect(totals.total).toBe(1000); // 1000 - 100 + 100
  });

  it("honours the discount cap in the final total", () => {
    const totals = calculateTotals({
      items: [item(10000)],
      promoCode: {
        code: "WELCOME20",
        discountType: "percentage",
        discount: 20,
        maxDiscount: 200,
      },
    });

    expect(totals.discount).toBe(200);
    expect(totals.total).toBe(9900); // 10000 - 200 + 100
  });

  it("never returns a negative total", () => {
    const totals = calculateTotals({
      items: [item(50)],
      deliveryType: "pickup",
      promoCode: { code: "HUGE", discountType: "fixed", discount: 99999 },
    });

    expect(totals.total).toBe(0);
    expect(totals.total).toBeGreaterThanOrEqual(0);
  });

  it("returns the full breakdown, so every surface quotes the same figures", () => {
    const totals = calculateTotals({ items: [item(1200, 2)] });

    expect(totals).toEqual({
      subtotal: 2400,
      shipping: 100,
      discount: 0,
      tax: 0,
      total: 2500,
      itemCount: 2,
    });
  });

  it("keeps the breakdown internally consistent", () => {
    const totals = calculateTotals({
      items: [item(1500, 2), item(800, 1)],
      promoCode: { code: "SWEET10", discountType: "percentage", discount: 10 },
    });

    expect(totals.total).toBe(
      pricing.round(
        totals.subtotal - totals.discount + totals.shipping + totals.tax
      )
    );
  });

  it("defaults tax to zero, preserving existing behaviour", () => {
    expect(calculateTotals({ items: [item(1000)] }).tax).toBe(0);
  });
});

describe("checkMinimumOrder", () => {
  it("allows an order at or above the minimum", () => {
    expect(checkMinimumOrder(500, 500).ok).toBe(true);
    expect(checkMinimumOrder(600, 500).ok).toBe(true);
  });

  it("rejects an order below the minimum, with a usable message", () => {
    const result = checkMinimumOrder(400, 500);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/500/);
  });

  it("treats a missing minimum as no minimum", () => {
    expect(checkMinimumOrder(0, undefined).ok).toBe(true);
  });
});

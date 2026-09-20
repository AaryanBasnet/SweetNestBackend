/**
 * Discount code tests.
 *
 * Covers both kinds of code and, importantly, the two bugs that this service
 * was extracted to fix:
 *   - a percentage cap that was declared but silently dropped
 *   - an earned coupon that could be spent an unlimited number of times
 */

const request = require("supertest");

const app = require("../app");
const Cart = require("../model/Cart");
const Coupon = require("../model/Coupon");
const Order = require("../model/Order");
const discountService = require("../services/discountService");
const {
  createUser,
  createCake,
  auth,
} = require("./helpers/factories");

const makeCoupon = (userId, overrides = {}) =>
  Coupon.create({
    user: userId,
    code: `TEST${Date.now()}${Math.floor(Math.random() * 1000)}`,
    discountType: "percentage",
    discountValue: 20,
    maxDiscount: 200,
    minOrderAmount: 0,
    rewardTier: { name: "Bronze", pointsCost: 100 },
    expiresAt: new Date(Date.now() + 7 * 86400000),
    ...overrides,
  });

/**
 * Puts a cart with a known subtotal in place for a user.
 *
 * Upserts rather than creates: Cart has a unique index on user, and placing a
 * cash-on-delivery order empties the cart without deleting the document, so a
 * second create for the same user would collide.
 */
const cartWorth = async (userId, price, quantity = 1) => {
  const cake = await createCake({
    weightOptions: [{ weightInKg: 1, label: "1 kg", price, isDefault: true }],
  });

  return Cart.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        items: [
          {
            cake: cake._id,
            quantity,
            selectedWeight: { weightInKg: 1, label: "1 kg", price },
          },
        ],
        promoCode: null,
        deliveryType: "delivery",
      },
    },
    { upsert: true, returnDocument: "after" }
  );
};

describe("resolveDiscountCode - public promo codes", () => {
  it("resolves a known code", async () => {
    const { user } = await createUser();

    const result = await discountService.resolveDiscountCode({
      code: "SWEET10",
      userId: user._id,
      subtotal: 1000,
    });

    expect(result).toMatchObject({
      code: "SWEET10",
      discountType: "percentage",
      discount: 10,
      isCoupon: false,
    });
  });

  it("is case and whitespace insensitive", async () => {
    const { user } = await createUser();

    const result = await discountService.resolveDiscountCode({
      code: "  sweet10  ",
      userId: user._id,
      subtotal: 1000,
    });

    expect(result.code).toBe("SWEET10");
  });

  it("rejects an unknown code", async () => {
    const { user } = await createUser();

    await expect(
      discountService.resolveDiscountCode({
        code: "NOTAREALCODE",
        userId: user._id,
        subtotal: 1000,
      })
    ).rejects.toMatchObject({ statusCode: 400, message: /invalid/i });
  });

  it("rejects an empty code", async () => {
    const { user } = await createUser();

    await expect(
      discountService.resolveDiscountCode({
        code: "",
        userId: user._id,
        subtotal: 1000,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("enforces the minimum order amount", async () => {
    const { user } = await createUser();

    // SWEET10 needs Rs 500.
    await expect(
      discountService.resolveDiscountCode({
        code: "SWEET10",
        userId: user._id,
        subtotal: 400,
      })
    ).rejects.toMatchObject({ statusCode: 400, message: /minimum/i });
  });

  it("carries maxDiscount through, so the cap can be enforced", async () => {
    const { user } = await createUser();

    const result = await discountService.resolveDiscountCode({
      code: "WELCOME20",
      userId: user._id,
      subtotal: 10000,
    });

    expect(result.maxDiscount).toBe(200);
  });
});

describe("resolveDiscountCode - earned coupons", () => {
  it("resolves a coupon belonging to the user", async () => {
    const { user } = await createUser();
    const coupon = await makeCoupon(user._id);

    const result = await discountService.resolveDiscountCode({
      code: coupon.code,
      userId: user._id,
      subtotal: 1000,
    });

    expect(result).toMatchObject({ code: coupon.code, isCoupon: true });
    expect(result.couponId.toString()).toBe(coupon._id.toString());
  });

  // A coupon is earned by one person with their own reward points.
  it("does not let another user redeem someone else's coupon", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const coupon = await makeCoupon(owner.user._id);

    await expect(
      discountService.resolveDiscountCode({
        code: coupon.code,
        userId: attacker.user._id,
        subtotal: 1000,
      })
    ).rejects.toMatchObject({ statusCode: 400, message: /invalid/i });
  });

  it("rejects an expired coupon", async () => {
    const { user } = await createUser();
    const coupon = await makeCoupon(user._id, {
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      discountService.resolveDiscountCode({
        code: coupon.code,
        userId: user._id,
        subtotal: 1000,
      })
    ).rejects.toMatchObject({ message: /expired/i });
  });

  it("rejects a coupon that has already been used", async () => {
    const { user } = await createUser();
    const coupon = await makeCoupon(user._id, { isUsed: true });

    await expect(
      discountService.resolveDiscountCode({
        code: coupon.code,
        userId: user._id,
        subtotal: 1000,
      })
    ).rejects.toMatchObject({ message: /already been used/i });
  });

  it("enforces the coupon's own minimum order amount", async () => {
    const { user } = await createUser();
    const coupon = await makeCoupon(user._id, { minOrderAmount: 5000 });

    await expect(
      discountService.resolveDiscountCode({
        code: coupon.code,
        userId: user._id,
        subtotal: 1000,
      })
    ).rejects.toMatchObject({ message: /minimum/i });
  });
});

describe("consumeCoupon", () => {
  it("marks the coupon used and records the order", async () => {
    const { user } = await createUser();
    const coupon = await makeCoupon(user._id);
    const orderId = coupon._id; // any id will do for the link

    expect(await discountService.consumeCoupon(coupon._id, orderId)).toBe(true);

    const fresh = await Coupon.findById(coupon._id);
    expect(fresh.isUsed).toBe(true);
    expect(fresh.usedAt).toBeInstanceOf(Date);
    expect(fresh.usedInOrder.toString()).toBe(orderId.toString());
  });

  it("returns false on a second attempt", async () => {
    const { user } = await createUser();
    const coupon = await makeCoupon(user._id);

    await discountService.consumeCoupon(coupon._id, coupon._id);
    expect(await discountService.consumeCoupon(coupon._id, coupon._id)).toBe(false);
  });

  // Checking isUsed and then saving would let two simultaneous checkouts both
  // read false and both succeed, spending one coupon twice.
  it("is consumed exactly once under concurrency", async () => {
    const { user } = await createUser();
    const coupon = await makeCoupon(user._id);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        discountService.consumeCoupon(coupon._id, coupon._id)
      )
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("is a no-op when there is no coupon", async () => {
    expect(await discountService.consumeCoupon(undefined, null)).toBe(false);
  });
});

describe("POST /api/cart/promo - end to end", () => {
  it("applies a public promo code", async () => {
    const { user, token } = await createUser();
    await cartWorth(user._id, 1000);

    const res = await request(app)
      .post("/api/cart/promo")
      .set(auth(token))
      .send({ code: "SWEET10" });

    expect(res.status).toBe(200);
    expect(res.body.data.discountAmount).toBe(100);
    expect(res.body.data.isCoupon).toBe(false);
  });

  // ==========================================================================
  // The regression test for the live bug.
  //
  // WELCOME20 is "20% off, up to Rs 200". The cap was written to a schema
  // field that did not exist, so it was dropped on save and never applied -
  // a Rs 10,000 order got Rs 2,000 off instead of Rs 200.
  // ==========================================================================
  it("enforces the discount cap end to end", async () => {
    const { user, token } = await createUser();
    await cartWorth(user._id, 10000);

    const res = await request(app)
      .post("/api/cart/promo")
      .set(auth(token))
      .send({ code: "WELCOME20" });

    expect(res.status).toBe(200);
    expect(res.body.data.discountAmount).toBe(200); // not 2000

    // And it survives the round trip to the database.
    const cart = await Cart.findOne({ user: user._id });
    expect(cart.promoCode.maxDiscount).toBe(200);
    expect(cart.discountAmount).toBe(200);
  });

  it("stores couponId so the coupon can later be consumed", async () => {
    const { user, token } = await createUser();
    await cartWorth(user._id, 2000);
    const coupon = await makeCoupon(user._id);

    await request(app)
      .post("/api/cart/promo")
      .set(auth(token))
      .send({ code: coupon.code });

    const cart = await Cart.findOne({ user: user._id });
    expect(cart.promoCode.couponId.toString()).toBe(coupon._id.toString());
  });

  it("rejects an invalid code with a 400", async () => {
    const { user, token } = await createUser();
    await cartWorth(user._id, 1000);

    const res = await request(app)
      .post("/api/cart/promo")
      .set(auth(token))
      .send({ code: "NOPE" });

    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/cart/promo").send({ code: "SWEET10" });
    expect(res.status).toBe(401);
  });
});

describe("coupon lifecycle through checkout", () => {
  const orderBody = {
    contactEmail: "customer@example.com",
    shippingAddress: {
      firstName: "Test",
      lastName: "Customer",
      address: "12 Test Road",
      city: "Kathmandu",
      phone: "9800000000",
    },
    deliverySchedule: {
      date: new Date(Date.now() + 3 * 86400000).toISOString(),
      timeSlot: "09:00 AM - 12:00 PM",
    },
    paymentMethod: "cod",
  };

  // ==========================================================================
  // The second live bug: nothing ever set isUsed, so a coupon earned once
  // with reward points could be spent on every order forever.
  // ==========================================================================
  it("consumes the coupon when the order is placed", async () => {
    const { user, token } = await createUser();
    await cartWorth(user._id, 2000);
    const coupon = await makeCoupon(user._id);

    await request(app)
      .post("/api/cart/promo")
      .set(auth(token))
      .send({ code: coupon.code });

    const res = await request(app)
      .post("/api/orders")
      .set(auth(token))
      .send(orderBody);

    expect(res.status).toBe(201);

    const fresh = await Coupon.findById(coupon._id);
    expect(fresh.isUsed).toBe(true);
    expect(fresh.usedInOrder.toString()).toBe(res.body.data._id.toString());
  });

  it("refuses to apply the same coupon to a second order", async () => {
    const { user, token } = await createUser();
    await cartWorth(user._id, 2000);
    const coupon = await makeCoupon(user._id);

    await request(app)
      .post("/api/cart/promo")
      .set(auth(token))
      .send({ code: coupon.code });
    await request(app).post("/api/orders").set(auth(token)).send(orderBody);

    // Start a fresh cart and try the same coupon again.
    await cartWorth(user._id, 2000);
    const second = await request(app)
      .post("/api/cart/promo")
      .set(auth(token))
      .send({ code: coupon.code });

    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already been used/i);
  });

  it("carries the capped discount onto the order total", async () => {
    const { user, token } = await createUser();
    await cartWorth(user._id, 10000);

    await request(app)
      .post("/api/cart/promo")
      .set(auth(token))
      .send({ code: "WELCOME20" });

    const res = await request(app)
      .post("/api/orders")
      .set(auth(token))
      .send(orderBody);

    const order = await Order.findById(res.body.data._id);
    expect(order.discount).toBe(200);
    expect(order.total).toBe(9900); // 10000 - 200 + 100 shipping
  });
});

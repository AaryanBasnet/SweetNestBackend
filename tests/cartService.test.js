/**
 * Cart service tests.
 *
 * Focused on syncCart, which had no coverage at all and which merges data
 * that arrives from the browser - the least trustworthy input in the system.
 */

const request = require("supertest");

const app = require("../app");
const Cart = require("../model/Cart");
const cartService = require("../services/cartService");
const { createUser, createCake, auth, objectId } = require("./helpers/factories");

const guestItem = (cake, quantity = 1, weightInKg = 1) => ({
  cakeId: cake._id.toString(),
  quantity,
  selectedWeight: { weightInKg, label: `${weightInKg} kg`, price: 999999 },
});

const addPayload = (cake, quantity = 1, weightInKg = 1) => ({
  cakeId: cake._id.toString(),
  quantity,
  selectedWeight: { weightInKg },
});

describe("syncCart - merging a guest cart on login", () => {
  it("adds guest items to an empty account cart", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    const result = await cartService.syncCart(user._id, [guestItem(cake, 2)]);

    expect(result.items).toHaveLength(1);
    expect(result.itemCount).toBe(2);
  });

  // The guest cart lives in localStorage, where anyone can edit it. Prices
  // must come from the catalogue no matter what arrives.
  it("ignores prices sent by the client", async () => {
    const { user } = await createUser();
    const cake = await createCake(); // 1 kg is 1200

    const result = await cartService.syncCart(user._id, [guestItem(cake)]);

    expect(result.items[0].selectedWeight.price).toBe(1200);
    expect(result.subtotal).toBe(1200);
  });

  it("merges quantities for a cake already in the account cart", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    await cartService.syncCart(user._id, [guestItem(cake, 2)]);
    const result = await cartService.syncCart(user._id, [guestItem(cake, 3)]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(5);
  });

  it("keeps different weights of the same cake as separate lines", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    const result = await cartService.syncCart(user._id, [
      guestItem(cake, 1, 1),
      guestItem(cake, 1, 2),
    ]);

    expect(result.items).toHaveLength(2);
    expect(result.subtotal).toBe(3400); // 1200 + 2200
  });

  it("caps a merged quantity at the maximum", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    await cartService.syncCart(user._id, [guestItem(cake, 8)]);
    const result = await cartService.syncCart(user._id, [guestItem(cake, 8)]);

    expect(result.items[0].quantity).toBe(10);
  });

  it("caps a single oversized guest line", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    const result = await cartService.syncCart(user._id, [guestItem(cake, 500)]);

    expect(result.items[0].quantity).toBe(10);
  });

  // A stale browser cart should not make signing in fail.
  it("skips a cake that no longer exists", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    const result = await cartService.syncCart(user._id, [
      guestItem(cake),
      { cakeId: objectId().toString(), quantity: 1, selectedWeight: { weightInKg: 1 } },
    ]);

    expect(result.items).toHaveLength(1);
  });

  it("skips a cake that has been deactivated", async () => {
    const { user } = await createUser();
    const active = await createCake();
    const retired = await createCake({ isActive: false });

    const result = await cartService.syncCart(user._id, [
      guestItem(active),
      guestItem(retired),
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].cake._id.toString()).toBe(active._id.toString());
  });

  it("skips a weight the cake no longer offers", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    const result = await cartService.syncCart(user._id, [
      guestItem(cake, 1, 1),
      guestItem(cake, 1, 99),
    ]);

    expect(result.items).toHaveLength(1);
  });

  it("handles an empty guest cart", async () => {
    const { user } = await createUser();

    const result = await cartService.syncCart(user._id, []);

    expect(result.items).toHaveLength(0);
  });

  it("rejects a payload that is not an array", async () => {
    const { user } = await createUser();

    await expect(cartService.syncCart(user._id, "nope")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("is reachable over HTTP and requires auth", async () => {
    const { token } = await createUser();
    const cake = await createCake();

    expect((await request(app).post("/api/cart/sync").send({ items: [] })).status).toBe(401);

    const res = await request(app)
      .post("/api/cart/sync")
      .set(auth(token))
      .send({ items: [guestItem(cake, 2)] });

    expect(res.status).toBe(200);
    expect(res.body.data.itemCount).toBe(2);
  });
});

// ==============================================================================
// addItem - concurrency.
//
// Confirmed via a manual script (scripts/race-test-cart-quantity.js) before
// this fix: 5 simultaneous "add 1" requests for the same cake and weight
// produced 5 separate duplicate lines instead of one line with quantity 5.
// The old implementation read the cart, decided in application code whether a
// matching line existed, and wrote the result back - every concurrent request
// read the cart before any of them had written, so each one independently
// concluded "no line yet" and pushed its own.
//
// These tests pin the fix down for CI: no server, no script, just Promise.all
// against the service function directly.
// ==============================================================================
describe("addItem - concurrency", () => {
  it("does not create duplicate lines under concurrent identical adds", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    await Promise.all(
      Array.from({ length: 5 }, () => cartService.addItem(user._id, addPayload(cake, 1)))
    );

    const cart = await Cart.findOne({ user: user._id });
    const matchingLines = cart.items.filter(
      (item) => item.cake.toString() === cake._id.toString()
    );

    expect(matchingLines).toHaveLength(1);
    expect(matchingLines[0].quantity).toBe(5);
  });

  it("does not lose updates when adding concurrently to an existing line", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    await cartService.addItem(user._id, addPayload(cake, 2));

    await Promise.all(
      Array.from({ length: 5 }, () => cartService.addItem(user._id, addPayload(cake, 1)))
    );

    const cart = await Cart.findOne({ user: user._id });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(7); // 2 + 5x1
  });

  // The regression test for the bug introduced while fixing the first one:
  // an earlier version of this fix made the cap-exceeded case succeed
  // silently instead of rejecting, which is a real behaviour change a
  // customer would notice (their "add 6 more" looks like it worked but
  // quietly only added 2).
  it("rejects rather than silently caps when concurrent adds would exceed the max", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    // 5 x "add 3" = 15 requested against a cap of 10. Some must succeed,
    // the rest must be rejected - none may be silently truncated.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => cartService.addItem(user._id, addPayload(cake, 3)))
    );

    const cart = await Cart.findOne({ user: user._id });
    const line = cart.items.find((item) => item.cake.toString() === cake._id.toString());

    expect(line.quantity).toBeLessThanOrEqual(10);

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected.length).toBeGreaterThan(0);
    rejected.forEach((r) => {
      expect(r.reason).toMatchObject({ statusCode: 400 });
      expect(r.reason.message).toMatch(/maximum quantity/i);
    });
  });

  it("keeps different weights of the same cake as independent lines under concurrency", async () => {
    const { user } = await createUser();
    const cake = await createCake(); // weight options at 1kg and 2kg

    await Promise.all([
      ...Array.from({ length: 3 }, () => cartService.addItem(user._id, addPayload(cake, 1, 1))),
      ...Array.from({ length: 3 }, () => cartService.addItem(user._id, addPayload(cake, 1, 2))),
    ]);

    const cart = await Cart.findOne({ user: user._id });
    const oneKg = cart.items.find((item) => item.selectedWeight.weightInKg === 1);
    const twoKg = cart.items.find((item) => item.selectedWeight.weightInKg === 2);

    expect(cart.items).toHaveLength(2);
    expect(oneKg.quantity).toBe(3);
    expect(twoKg.quantity).toBe(3);
  });

  it("still rejects a single request over the cap, sequentially", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    await expect(
      cartService.addItem(user._id, addPayload(cake, 11))
    ).rejects.toMatchObject({ statusCode: 400, message: /maximum quantity is 10/i });
  });

  it("still rejects a sequential add that would push an existing line over the cap", async () => {
    const { user } = await createUser();
    const cake = await createCake();

    await cartService.addItem(user._id, addPayload(cake, 6));

    await expect(
      cartService.addItem(user._id, addPayload(cake, 6))
    ).rejects.toMatchObject({ statusCode: 400, message: /maximum quantity is 10/i });

    // And the rejected attempt must not have partially applied.
    const cart = await Cart.findOne({ user: user._id });
    expect(cart.items[0].quantity).toBe(6);
  });
});

describe("cart responses", () => {
  it("every cart endpoint returns the same shape", async () => {
    const { token } = await createUser();
    const cake = await createCake();

    const added = await request(app)
      .post("/api/cart")
      .set(auth(token))
      .send({
        cakeId: cake._id.toString(),
        quantity: 1,
        selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
      });

    const fetched = await request(app).get("/api/cart").set(auth(token));

    // The header badge, the cart page and the checkout summary all read these
    // fields; they must not differ by endpoint.
    const expectedKeys = [
      "items",
      "itemCount",
      "subtotal",
      "shipping",
      "discountAmount",
      "tax",
      "total",
      "deliveryType",
      "promoCode",
    ];

    expectedKeys.forEach((key) => {
      expect(added.body.data).toHaveProperty(key);
      expect(fetched.body.data).toHaveProperty(key);
    });
  });

  it("clearing the cart also drops the promo code", async () => {
    const { user, token } = await createUser();
    const cake = await createCake({
      weightOptions: [{ weightInKg: 1, label: "1 kg", price: 2000, isDefault: true }],
    });

    await request(app)
      .post("/api/cart")
      .set(auth(token))
      .send({
        cakeId: cake._id.toString(),
        quantity: 1,
        selectedWeight: { weightInKg: 1 },
      });
    await request(app).post("/api/cart/promo").set(auth(token)).send({ code: "SWEET10" });

    await request(app).delete("/api/cart").set(auth(token));

    const cart = await Cart.findOne({ user: user._id });
    expect(cart.items).toHaveLength(0);
    expect(cart.promoCode?.code).toBeFalsy();
  });
});

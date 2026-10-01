/**
 * Cake catalog tests.
 *
 * Focused on the regression this file exists to pin down: getCakes,
 * getFeaturedCakes and getCakesByCategory all use .lean() for the read
 * performance win documented in PERFORMANCE_LOG.MD (Finding 1) - but
 * .lean() skips Mongoose's document layer entirely, and a virtual getter
 * (basePrice) never runs against a plain object. Every card on the menu, the
 * hero, and every category page silently showed no price at all, and nothing
 * in the test suite caught it because this controller had no tests.
 */

const request = require("supertest");

const app = require("../app");
const { createCake, createCategory } = require("./helpers/factories");

describe("GET /api/cakes - basePrice", () => {
  it("includes basePrice, the cheapest weight option, on every cake", async () => {
    await createCake({
      weightOptions: [
        { weightInKg: 0.5, label: "500g", price: 600, isDefault: true },
        { weightInKg: 1, label: "1 kg", price: 1100 },
      ],
    });

    const res = await request(app).get("/api/cakes");

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach((cake) => {
      expect(cake.basePrice).toEqual(expect.any(Number));
    });
    expect(res.body.data.find((c) => c.basePrice === 600)).toBeTruthy();
  });

  it("picks the minimum across weight options, not the first one listed", async () => {
    await createCake({
      weightOptions: [
        { weightInKg: 2, label: "2 kg", price: 2000, isDefault: true },
        { weightInKg: 0.5, label: "500g", price: 500 }, // cheapest, listed second
        { weightInKg: 1, label: "1 kg", price: 1000 },
      ],
    });

    const res = await request(app).get("/api/cakes");

    const cake = res.body.data.find((c) => c.name && c.weightOptions?.length === 3);
    expect(cake.basePrice).toBe(500);
  });
});

describe("GET /api/cakes/featured - basePrice", () => {
  it("includes basePrice on featured cakes too", async () => {
    await createCake({
      isFeatured: true,
      weightOptions: [{ weightInKg: 1, label: "1 kg", price: 777, isDefault: true }],
    });

    const res = await request(app).get("/api/cakes/featured");

    expect(res.status).toBe(200);
    const cake = res.body.data.find((c) => c.basePrice === 777);
    expect(cake).toBeTruthy();
  });
});

describe("GET /api/cakes/category/:categorySlug - basePrice", () => {
  it("includes basePrice on cakes listed by category", async () => {
    const category = await createCategory();
    await createCake({
      category: category._id,
      weightOptions: [{ weightInKg: 1, label: "1 kg", price: 888, isDefault: true }],
    });

    const res = await request(app).get(`/api/cakes/category/${category.slug}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].basePrice).toBe(888);
  });
});

describe("Cake.computeBasePrice", () => {
  const Cake = require("../model/Cake");

  it("returns the minimum price across weight options", () => {
    expect(
      Cake.computeBasePrice([
        { price: 500 },
        { price: 300 },
        { price: 900 },
      ])
    ).toBe(300);
  });

  it("returns 0 for a cake with no weight options", () => {
    expect(Cake.computeBasePrice([])).toBe(0);
    expect(Cake.computeBasePrice(undefined)).toBe(0);
  });

  // The whole point of extracting this function: the virtual (used by the
  // single-cake, non-lean endpoints) and the lean-query controllers must
  // agree, or a cake's price would depend on which endpoint fetched it.
  it("agrees with the basePrice virtual on an actual document", async () => {
    const cake = await createCake({
      weightOptions: [
        { weightInKg: 1, label: "1 kg", price: 444, isDefault: true },
        { weightInKg: 2, label: "2 kg", price: 777 },
      ],
    });

    expect(cake.basePrice).toBe(444);
    expect(Cake.computeBasePrice(cake.weightOptions)).toBe(cake.basePrice);
  });
});

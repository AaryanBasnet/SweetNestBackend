const request = require("supertest");

const app = require("../app");
const Cart = require("../model/Cart");
const { createUser, createCake, auth } = require("./helpers/factories");

const addItem = (token, body) =>
  request(app).post("/api/cart").set(auth(token)).send(body);

describe("cart authentication", () => {
  it("requires a token", async () => {
    expect((await request(app).get("/api/cart")).status).toBe(401);
  });
});

describe("POST /api/cart - price integrity", () => {
  // The single most important property of a shopping cart: the price comes
  // from the database, never from the request. If a client can name its own
  // price, everything downstream (order total, payment amount) is fiction.
  it("ignores a price supplied by the client", async () => {
    const { token } = await createUser();
    const cake = await createCake(); // 1 kg costs 1200

    const res = await addItem(token, {
      cakeId: cake._id.toString(),
      quantity: 1,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1 },
    });

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].selectedWeight.price).toBe(1200);
    expect(res.body.data.subtotal).toBe(1200);
  });

  it("ignores a client-supplied label too", async () => {
    const { token } = await createUser();
    const cake = await createCake();

    const res = await addItem(token, {
      cakeId: cake._id.toString(),
      quantity: 1,
      selectedWeight: { weightInKg: 2, label: "FREE CAKE", price: 0 },
    });

    expect(res.body.data.items[0].selectedWeight.label).toBe("2 kg");
    expect(res.body.data.items[0].selectedWeight.price).toBe(2200);
  });

  it("rejects a weight option the cake does not offer", async () => {
    const { token } = await createUser();
    const cake = await createCake();

    const res = await addItem(token, {
      cakeId: cake._id.toString(),
      quantity: 1,
      selectedWeight: { weightInKg: 99, label: "99 kg", price: 10 },
    });

    expect(res.status).toBe(400);
  });

  it("rejects an inactive cake", async () => {
    const { token } = await createUser();
    const cake = await createCake({ isActive: false });

    const res = await addItem(token, {
      cakeId: cake._id.toString(),
      quantity: 1,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
    });

    expect(res.status).toBe(404);
  });
});

describe("cart quantity rules", () => {
  it("merges a repeat add of the same cake and weight", async () => {
    const { token } = await createUser();
    const cake = await createCake();
    const item = {
      cakeId: cake._id.toString(),
      quantity: 2,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
    };

    await addItem(token, item);
    const res = await addItem(token, item);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(4);
  });

  it("keeps different weights as separate lines", async () => {
    const { token } = await createUser();
    const cake = await createCake();

    await addItem(token, {
      cakeId: cake._id.toString(),
      quantity: 1,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
    });
    const res = await addItem(token, {
      cakeId: cake._id.toString(),
      quantity: 1,
      selectedWeight: { weightInKg: 2, label: "2 kg", price: 2200 },
    });

    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.subtotal).toBe(3400);
  });

  it("refuses to push a line past the maximum quantity", async () => {
    const { token } = await createUser();
    const cake = await createCake();
    const item = {
      cakeId: cake._id.toString(),
      quantity: 6,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
    };

    await addItem(token, item);
    const res = await addItem(token, item); // would be 12

    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range quantity on update", async () => {
    const { token } = await createUser();
    const cake = await createCake();
    const added = await addItem(token, {
      cakeId: cake._id.toString(),
      quantity: 1,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
    });
    const itemId = added.body.data.items[0]._id;

    const tooMany = await request(app)
      .put(`/api/cart/${itemId}`)
      .set(auth(token))
      .send({ quantity: 50 });
    const tooFew = await request(app)
      .put(`/api/cart/${itemId}`)
      .set(auth(token))
      .send({ quantity: 0 });

    expect(tooMany.status).toBe(400);
    expect(tooFew.status).toBe(400);
  });
});

describe("cart isolation between users", () => {
  it("never shows one user another user's cart", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const cake = await createCake();

    await addItem(alice.token, {
      cakeId: cake._id.toString(),
      quantity: 3,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
    });

    const res = await request(app).get("/api/cart").set(auth(bob.token));

    expect(res.body.data.items).toHaveLength(0);
  });

  it("does not let a user delete an item from someone else's cart", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const cake = await createCake();

    const added = await addItem(alice.token, {
      cakeId: cake._id.toString(),
      quantity: 1,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
    });
    const itemId = added.body.data.items[0]._id;

    await request(app).delete(`/api/cart/${itemId}`).set(auth(bob.token));

    const aliceCart = await Cart.findOne({ user: alice.user._id });
    expect(aliceCart.items).toHaveLength(1);
  });
});

describe("cart totals", () => {
  it("computes subtotal, shipping and total on the server", async () => {
    const { token } = await createUser();
    const cake = await createCake();

    await addItem(token, {
      cakeId: cake._id.toString(),
      quantity: 2,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
    });

    const res = await request(app).get("/api/cart").set(auth(token));

    expect(res.body.data.subtotal).toBe(2400);
    expect(res.body.data.shipping).toBe(100); // delivery is the default
    expect(res.body.data.total).toBe(2500);
  });

  it("drops the shipping charge for pickup", async () => {
    const { token } = await createUser();
    const cake = await createCake();

    await addItem(token, {
      cakeId: cake._id.toString(),
      quantity: 1,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
    });
    await request(app)
      .put("/api/cart/delivery")
      .set(auth(token))
      .send({ deliveryType: "pickup" });

    const res = await request(app).get("/api/cart").set(auth(token));

    expect(res.body.data.shipping).toBe(0);
    expect(res.body.data.total).toBe(1200);
  });

  it("hides items whose cake has since been deactivated", async () => {
    const { token } = await createUser();
    const cake = await createCake();

    await addItem(token, {
      cakeId: cake._id.toString(),
      quantity: 1,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
    });

    cake.isActive = false;
    await cake.save();

    const res = await request(app).get("/api/cart").set(auth(token));

    expect(res.body.data.items).toHaveLength(0);
  });

  it("empties the cart on clear", async () => {
    const { token } = await createUser();
    const cake = await createCake();

    await addItem(token, {
      cakeId: cake._id.toString(),
      quantity: 1,
      selectedWeight: { weightInKg: 1, label: "1 kg", price: 1200 },
    });
    await request(app).delete("/api/cart").set(auth(token));

    const res = await request(app).get("/api/cart").set(auth(token));
    expect(res.body.data.items).toHaveLength(0);
  });
});

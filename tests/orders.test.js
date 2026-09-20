const request = require("supertest");

const app = require("../app");
const Cart = require("../model/Cart");
const Order = require("../model/Order");
const {
  createUser,
  createAdmin,
  createCake,
  createCartWithItem,
  createOrder,
  auth,
  objectId,
} = require("./helpers/factories");

const validOrderBody = (overrides = {}) => ({
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
  paymentMethod: "esewa",
  ...overrides,
});

const placeOrder = (token, overrides) =>
  request(app).post("/api/orders").set(auth(token)).send(validOrderBody(overrides));

describe("POST /api/orders", () => {
  it("requires authentication", async () => {
    expect((await request(app).post("/api/orders").send(validOrderBody())).status).toBe(401);
  });

  it("refuses to create an order from an empty cart", async () => {
    const { token } = await createUser();

    const res = await placeOrder(token);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/empty/i);
  });

  it("creates an order from the cart", async () => {
    const { user, token } = await createUser();
    const cake = await createCake();
    await createCartWithItem(user._id, cake, 2);

    const res = await placeOrder(token);

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(2);
  });

  // The totals must be derived from the server's own cart, never accepted
  // from the request body - otherwise the customer sets their own price.
  it("computes totals from the cart and ignores any totals in the request", async () => {
    const { user, token } = await createUser();
    const cake = await createCake();
    await createCartWithItem(user._id, cake, 2); // 2 x 1200 = 2400

    const res = await placeOrder(token, {
      subtotal: 1,
      total: 1,
      discount: 99999,
      shipping: 0,
    });

    expect(res.body.data.subtotal).toBe(2400);
    expect(res.body.data.shipping).toBe(100);
    expect(res.body.data.total).toBe(2500);
  });

  it("generates a unique order number", async () => {
    const { user, token } = await createUser();
    const cake = await createCake();

    await createCartWithItem(user._id, cake);
    const first = await placeOrder(token);

    await createCartWithItem(user._id, cake).catch(() => {});
    await Cart.findOneAndUpdate(
      { user: user._id },
      {
        items: [
          {
            cake: cake._id,
            quantity: 1,
            selectedWeight: {
              weightInKg: 1,
              label: "1 kg",
              price: 1200,
            },
          },
        ],
      }
    );
    const second = await placeOrder(token);

    expect(first.body.data.orderNumber).toBeTruthy();
    expect(second.body.data.orderNumber).not.toBe(first.body.data.orderNumber);
  });

  it("assigns the order to the authenticated user, not a user named in the body", async () => {
    const { user, token } = await createUser();
    const someoneElse = await createUser();
    const cake = await createCake();
    await createCartWithItem(user._id, cake);

    const res = await placeOrder(token, { user: someoneElse.user._id.toString() });

    const stored = await Order.findById(res.body.data._id);
    expect(stored.user.toString()).toBe(user._id.toString());
  });

  it("clears the cart for a cash-on-delivery order", async () => {
    const { user, token } = await createUser();
    const cake = await createCake();
    await createCartWithItem(user._id, cake);

    await placeOrder(token, { paymentMethod: "cod" });

    const cart = await Cart.findOne({ user: user._id });
    expect(cart.items).toHaveLength(0);
  });

  // For eSewa the cart survives until payment actually succeeds, so a failed
  // payment does not leave the customer with nothing to retry.
  it("keeps the cart for an eSewa order until payment settles", async () => {
    const { user, token } = await createUser();
    const cake = await createCake();
    await createCartWithItem(user._id, cake);

    await placeOrder(token, { paymentMethod: "esewa" });

    const cart = await Cart.findOne({ user: user._id });
    expect(cart.items).toHaveLength(1);
  });

  it("rejects an invalid delivery time slot", async () => {
    const { user, token } = await createUser();
    const cake = await createCake();
    await createCartWithItem(user._id, cake);

    const res = await placeOrder(token, {
      deliverySchedule: {
        date: new Date(Date.now() + 86400000).toISOString(),
        timeSlot: "3am sharp",
      },
    });

    expect(res.status).toBe(400);
  });

  it("rejects a missing shipping address", async () => {
    const { user, token } = await createUser();
    const cake = await createCake();
    await createCartWithItem(user._id, cake);

    const res = await placeOrder(token, { shippingAddress: undefined });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/orders/:id - ownership", () => {
  it("lets the owner read their order", async () => {
    const { user, token } = await createUser();
    const order = await createOrder(user._id);

    const res = await request(app).get(`/api/orders/${order._id}`).set(auth(token));

    expect(res.status).toBe(200);
  });

  it("refuses to show one customer another customer's order", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const order = await createOrder(owner.user._id);

    const res = await request(app)
      .get(`/api/orders/${order._id}`)
      .set(auth(attacker.token));

    expect(res.status).toBe(403);
  });

  it("lets an admin read any order", async () => {
    const customer = await createUser();
    const admin = await createAdmin();
    const order = await createOrder(customer.user._id);

    const res = await request(app)
      .get(`/api/orders/${order._id}`)
      .set(auth(admin.token));

    expect(res.status).toBe(200);
  });

  it("404s for an order that does not exist", async () => {
    const { token } = await createUser();

    const res = await request(app)
      .get(`/api/orders/${objectId()}`)
      .set(auth(token));

    expect(res.status).toBe(404);
  });
});

describe("GET /api/orders - my orders", () => {
  it("returns only the caller's orders", async () => {
    const alice = await createUser();
    const bob = await createUser();
    await createOrder(alice.user._id);
    await createOrder(alice.user._id);
    await createOrder(bob.user._id);

    const res = await request(app).get("/api/orders").set(auth(alice.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    res.body.data.forEach((order) =>
      expect(order.user.toString()).toBe(alice.user._id.toString())
    );
  });
});

describe("admin order routes", () => {
  it("refuses a normal user access to all orders", async () => {
    const { token } = await createUser();

    const res = await request(app).get("/api/orders/admin/all").set(auth(token));

    expect(res.status).toBe(403);
  });

  it("refuses a normal user the ability to change order status", async () => {
    const customer = await createUser();
    const order = await createOrder(customer.user._id);

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(customer.token))
      .send({ status: "confirmed" });

    expect(res.status).toBe(403);
    expect((await Order.findById(order._id)).orderStatus).toBe("pending");
  });

  it("refuses a normal user the ability to issue a refund", async () => {
    const customer = await createUser();
    const order = await createOrder(customer.user._id, { paymentStatus: "paid" });

    const res = await request(app)
      .put(`/api/orders/${order._id}/refund`)
      .set(auth(customer.token))
      .send({});

    expect(res.status).toBe(403);
    expect((await Order.findById(order._id)).paymentStatus).toBe("paid");
  });

  it("lets an admin advance the order through a legal transition", async () => {
    const customer = await createUser();
    const admin = await createAdmin();
    const order = await createOrder(customer.user._id); // starts 'pending'

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(admin.token))
      .send({ status: "confirmed" });

    expect(res.status).toBe(200);
    expect((await Order.findById(order._id)).orderStatus).toBe("confirmed");
  });
});

// Order.updateStatus enforces a state machine. These tests pin that behaviour
// down so a future refactor cannot quietly drop it.
describe("order status transitions", () => {
  it("rejects a skipped step", async () => {
    const customer = await createUser();
    const admin = await createAdmin();
    const order = await createOrder(customer.user._id); // pending

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(admin.token))
      .send({ status: "delivered" }); // pending -> delivered is not allowed

    expect(res.status).toBe(400);
    expect((await Order.findById(order._id)).orderStatus).toBe("pending");
  });

  it("refuses to move an order backwards", async () => {
    const customer = await createUser();
    const admin = await createAdmin();
    const order = await createOrder(customer.user._id, {
      orderStatus: "out_for_delivery",
    });

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(admin.token))
      .send({ status: "pending" });

    expect(res.status).toBe(400);
  });

  it("treats delivered as terminal", async () => {
    const customer = await createUser();
    const admin = await createAdmin();
    const order = await createOrder(customer.user._id, { orderStatus: "delivered" });

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(admin.token))
      .send({ status: "cancelled" });

    expect(res.status).toBe(400);
  });

  it("allows cancelling from an in-flight state", async () => {
    const customer = await createUser();
    const admin = await createAdmin();
    const order = await createOrder(customer.user._id, { orderStatus: "processing" });

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(admin.token))
      .send({ status: "cancelled", notes: "Out of ingredients" });

    expect(res.status).toBe(200);
    expect((await Order.findById(order._id)).orderStatus).toBe("cancelled");
  });

  // The guard lives in a document method, so it only protects writes that go
  // through it. A direct update bypasses it entirely - worth knowing before
  // someone "optimises" a controller into findByIdAndUpdate.
  it("is bypassed by a direct database update (documented limitation)", async () => {
    const customer = await createUser();
    const order = await createOrder(customer.user._id, { orderStatus: "delivered" });

    await Order.findByIdAndUpdate(order._id, { orderStatus: "pending" });

    expect((await Order.findById(order._id)).orderStatus).toBe("pending");
  });
});

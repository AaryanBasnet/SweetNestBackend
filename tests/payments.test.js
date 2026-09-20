const crypto = require("crypto");
const request = require("supertest");

const app = require("../app");
const Order = require("../model/Order");
const Cart = require("../model/Cart");
const esewaController = require("../controller/esewaController");
const {
  createUser,
  createCake,
  createCartWithItem,
  createOrder,
  auth,
} = require("./helpers/factories");

const { parseAmount, amountsMatch, failureToken, settleOrder } =
  esewaController._internals;

const SECRET = process.env.ESEWA_SECRET_KEY;

/** Builds the base64 payload eSewa redirects back with. */
const esewaCallbackData = (fields) => {
  const signedFieldNames = "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names";
  const payload = { ...fields, signed_field_names: signedFieldNames };

  const message = signedFieldNames
    .split(",")
    .map((name) => `${name}=${payload[name]}`)
    .join(",");

  payload.signature = crypto
    .createHmac("sha256", SECRET)
    .update(message)
    .digest("base64");

  return Buffer.from(JSON.stringify(payload)).toString("base64");
};

/** Makes fetch answer as eSewa's transaction status API would. */
const mockEsewaStatus = (body) => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }));
};

const mockEsewaUnreachable = () => {
  global.fetch = jest.fn(async () => {
    throw new Error("network down");
  });
};

afterEach(() => {
  delete global.fetch;
});

// ---------------------------------------------------------------------------

describe("amount parsing", () => {
  // The regression test for the bug that rejected every order over Rs 1,000
  // AFTER the customer had paid: eSewa formats amounts as "1,100.0" and
  // parseFloat("1,100.0") is 1.
  it("parses amounts that carry thousands separators", () => {
    expect(parseAmount("1,100.0")).toBe(1100);
    expect(parseAmount("12,345.67")).toBeCloseTo(12345.67);
    expect(parseAmount("999.0")).toBe(999);
    expect(parseAmount(1500)).toBe(1500);
  });

  it("treats a separated amount as equal to the order total", () => {
    expect(amountsMatch(parseAmount("1,600.0"), 1600)).toBe(true);
  });

  it("still rejects a genuinely different amount", () => {
    expect(amountsMatch(parseAmount("1,500.0"), 1600)).toBe(false);
    expect(amountsMatch(parseAmount("1.0"), 1600)).toBe(false);
  });

  it("rejects values that are not numbers at all", () => {
    expect(amountsMatch(parseAmount("abc"), 1600)).toBe(false);
    expect(amountsMatch(parseAmount(null), 1600)).toBe(false);
  });
});

describe("Order.markPaidOnce", () => {
  it("settles a pending order and confirms it", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);

    const updated = await Order.markPaidOnce(order._id, {
      transactionId: "T1",
      refId: "R1",
      amount: 1600,
    });

    expect(updated).not.toBeNull();
    expect(updated.paymentStatus).toBe("paid");
    expect(updated.orderStatus).toBe("confirmed");
    expect(updated.esewa.refId).toBe("R1");
    expect(updated.esewa.paidAt).toBeInstanceOf(Date);
  });

  it("returns null when the order is already paid", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);

    await Order.markPaidOnce(order._id, { transactionId: "T1" });
    const replay = await Order.markPaidOnce(order._id, { transactionId: "T1" });

    expect(replay).toBeNull();
  });

  // The important one. A read-then-write guard lets two concurrent callbacks
  // both see "pending" and both settle, running every side effect twice.
  it("settles exactly once under concurrent callbacks", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        Order.markPaidOnce(order._id, { transactionId: "T2", amount: 1600 })
      )
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("does not drag a further-along order back to confirmed", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id, { orderStatus: "out_for_delivery" });

    const updated = await Order.markPaidOnce(order._id, { transactionId: "T3" });

    expect(updated.orderStatus).toBe("out_for_delivery");
  });
});

describe("Order.markPaymentFailed", () => {
  it("marks a pending order failed", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);

    const updated = await Order.markPaymentFailed(order._id);

    expect(updated.paymentStatus).toBe("failed");
  });

  it("refuses to overwrite a paid order", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);
    await Order.markPaidOnce(order._id, { transactionId: "T1" });

    const result = await Order.markPaymentFailed(order._id);

    expect(result).toBeNull();
    expect((await Order.findById(order._id)).paymentStatus).toBe("paid");
  });
});

describe("settleOrder - eSewa is the source of truth", () => {
  it("marks the order paid when eSewa says COMPLETE", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);
    mockEsewaStatus({ status: "COMPLETE", ref_id: "REF123", total_amount: "1,600.0" });

    const outcome = await settleOrder(order);

    expect(outcome).toBe("paid");
    expect((await Order.findById(order._id)).paymentStatus).toBe("paid");
  });

  it("clears the cart once the order is paid", async () => {
    const { user } = await createUser();
    const cake = await createCake();
    await createCartWithItem(user._id, cake);
    const order = await createOrder(user._id);
    mockEsewaStatus({ status: "COMPLETE", ref_id: "REF123", total_amount: "1600" });

    await settleOrder(order);

    const cart = await Cart.findOne({ user: user._id });
    expect(cart.items).toHaveLength(0);
  });

  it("refuses to settle when eSewa reports a different amount", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id); // total 1600
    mockEsewaStatus({ status: "COMPLETE", ref_id: "REF123", total_amount: "100.0" });

    const outcome = await settleOrder(order);

    expect(outcome).toBe("failed");
    expect((await Order.findById(order._id)).paymentStatus).not.toBe("paid");
  });

  it("reports pending while eSewa is still settling", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);
    mockEsewaStatus({ status: "PENDING", total_amount: "1600" });

    expect(await settleOrder(order)).toBe("pending");
    expect((await Order.findById(order._id)).paymentStatus).toBe("pending");
  });

  it("marks the order failed when eSewa says CANCELED", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);
    mockEsewaStatus({ status: "CANCELED", total_amount: "1600" });

    expect(await settleOrder(order)).toBe("failed");
    expect((await Order.findById(order._id)).paymentStatus).toBe("failed");
  });

  // If we cannot reach eSewa we do not know what happened. Guessing "failed"
  // would cancel orders customers have actually paid for.
  it("leaves the order alone when eSewa is unreachable", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);
    mockEsewaUnreachable();

    expect(await settleOrder(order)).toBe("unverified");
    expect((await Order.findById(order._id)).paymentStatus).toBe("pending");
  });

  it("is a no-op for an already paid order and does not call eSewa", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id, { paymentStatus: "paid" });
    mockEsewaStatus({ status: "COMPLETE", total_amount: "1600" });

    expect(await settleOrder(order)).toBe("paid");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("POST /api/esewa/initiate", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/api/esewa/initiate").send({ orderId: "x" });

    expect(res.status).toBe(401);
  });

  it("refuses to let one user pay for another user's order", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const order = await createOrder(owner.user._id);

    const res = await request(app)
      .post("/api/esewa/initiate")
      .set(auth(attacker.token))
      .send({ orderId: order._id.toString() });

    expect(res.status).toBe(403);
  });

  it("returns signed form data for the owner", async () => {
    const { user, token } = await createUser();
    const order = await createOrder(user._id);

    const res = await request(app)
      .post("/api/esewa/initiate")
      .set(auth(token))
      .send({ orderId: order._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data.formData.signature).toEqual(expect.any(String));
    expect(res.body.data.formData.total_amount).toBe("1600");
    // The failure callback must carry an HMAC, or it is an open endpoint.
    expect(res.body.data.formData.failure_url).toMatch(/token=[a-f0-9]{64}/);
  });

  it("refuses an order that is already paid", async () => {
    const { user, token } = await createUser();
    const order = await createOrder(user._id, { paymentStatus: "paid" });

    const res = await request(app)
      .post("/api/esewa/initiate")
      .set(auth(token))
      .send({ orderId: order._id.toString() });

    expect(res.status).toBe(400);
  });

  it("refuses a cash-on-delivery order", async () => {
    const { user, token } = await createUser();
    const order = await createOrder(user._id, { paymentMethod: "cod" });

    const res = await request(app)
      .post("/api/esewa/initiate")
      .set(auth(token))
      .send({ orderId: order._id.toString() });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/esewa/verify", () => {
  it("rejects a payload with a bad signature", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);

    const forged = Buffer.from(
      JSON.stringify({
        transaction_uuid: order.esewa.transactionId,
        status: "COMPLETE",
        total_amount: "1600",
        signed_field_names: "status,total_amount",
        signature: "obviously-not-a-real-signature",
      })
    ).toString("base64");

    const res = await request(app).get("/api/esewa/verify").query({ data: forged });

    expect(res.headers.location).toMatch(/status=error/);
    expect((await Order.findById(order._id)).paymentStatus).toBe("pending");
  });

  it("rejects a payload that is not valid base64 JSON", async () => {
    const res = await request(app)
      .get("/api/esewa/verify")
      .query({ data: "!!!not-base64!!!" });

    expect(res.headers.location).toMatch(/status=error/);
  });

  // A correct signature alone is not enough - the previous code stopped here
  // and marked the order paid. The server must still ask eSewa directly.
  it("settles a correctly signed callback only after confirming with eSewa", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);
    mockEsewaStatus({ status: "COMPLETE", ref_id: "REF9", total_amount: "1,600.0" });

    const data = esewaCallbackData({
      transaction_code: "ABC",
      status: "COMPLETE",
      total_amount: "1,600.0",
      transaction_uuid: order.esewa.transactionId,
      product_code: process.env.ESEWA_MERCHANT_ID,
    });

    const res = await request(app).get("/api/esewa/verify").query({ data });

    expect(global.fetch).toHaveBeenCalled();
    expect(res.headers.location).toMatch(/status=success/);
    expect((await Order.findById(order._id)).paymentStatus).toBe("paid");
  });

  it("shows 'processing', not 'failed', when eSewa cannot be reached", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);
    mockEsewaUnreachable();

    const data = esewaCallbackData({
      transaction_code: "ABC",
      status: "COMPLETE",
      total_amount: "1600",
      transaction_uuid: order.esewa.transactionId,
      product_code: process.env.ESEWA_MERCHANT_ID,
    });

    const res = await request(app).get("/api/esewa/verify").query({ data });

    expect(res.headers.location).toMatch(/status=processing/);
  });
});

describe("GET /api/esewa/failed - the IDOR that was open", () => {
  it("ignores an orderId with no token", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);

    const res = await request(app)
      .get("/api/esewa/failed")
      .query({ orderId: order._id.toString() });

    expect(res.status).toBe(302);
    expect((await Order.findById(order._id)).paymentStatus).toBe("pending");
  });

  it("ignores a forged token", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);

    const res = await request(app)
      .get("/api/esewa/failed")
      .query({ orderId: order._id.toString(), token: "a".repeat(64) });

    expect(res.status).toBe(302);
    expect((await Order.findById(order._id)).paymentStatus).toBe("pending");
  });

  it("acts on a correctly signed callback", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);
    mockEsewaStatus({ status: "CANCELED", total_amount: "1600" });

    await request(app)
      .get("/api/esewa/failed")
      .query({
        orderId: order._id.toString(),
        token: failureToken(order._id.toString()),
      });

    expect((await Order.findById(order._id)).paymentStatus).toBe("failed");
  });

  // A customer can pay and still land on the failure URL (a redirect glitch,
  // a back button). We confirm with eSewa before believing "failed".
  it("still settles an order the customer actually paid for", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);
    mockEsewaStatus({ status: "COMPLETE", ref_id: "REF5", total_amount: "1600" });

    const res = await request(app)
      .get("/api/esewa/failed")
      .query({
        orderId: order._id.toString(),
        token: failureToken(order._id.toString()),
      });

    expect(res.headers.location).toMatch(/status=success/);
    expect((await Order.findById(order._id)).paymentStatus).toBe("paid");
  });

  it("produces a distinct, unguessable token per order", () => {
    const a = failureToken("000000000000000000000001");
    const b = failureToken("000000000000000000000002");

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("GET /api/esewa/status/:orderId", () => {
  it("requires authentication", async () => {
    const { user } = await createUser();
    const order = await createOrder(user._id);

    const res = await request(app).get(`/api/esewa/status/${order._id}`);

    expect(res.status).toBe(401);
  });

  it("refuses to show another user's order", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const order = await createOrder(owner.user._id);

    const res = await request(app)
      .get(`/api/esewa/status/${order._id}`)
      .set(auth(attacker.token));

    expect(res.status).toBe(403);
  });

  // The recovery path for "customer paid, then closed the tab".
  it("reconciles a pending order with eSewa when polled", async () => {
    const { user, token } = await createUser();
    const order = await createOrder(user._id);
    mockEsewaStatus({ status: "COMPLETE", ref_id: "REF7", total_amount: "1600" });

    const res = await request(app)
      .get(`/api/esewa/status/${order._id}`)
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.paymentStatus).toBe("paid");
  });
});

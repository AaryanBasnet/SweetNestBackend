/**
 * The "Keep me updated on news and exclusive offers" tick box at checkout.
 *
 * It used to be saved on the order and then ignored, so ticking it signed
 * nobody up. These tests pin down that it now does, and that it can never
 * break the order itself.
 */

jest.mock("../services/newsletterService", () => ({ subscribe: jest.fn() }));

const request = require("supertest");

const app = require("../app");
const newsletterService = require("../services/newsletterService");
const seedDemoAccounts = require("../utils/seedDemoAccounts");
const { createUser, createCake, createCartWithItem, auth } = require("./helpers/factories");

const orderBody = (overrides = {}) => ({
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
  ...overrides,
});

const placeOrder = async (token, user, overrides) => {
  await createCartWithItem(user._id, await createCake(), 1);
  return request(app).post("/api/orders").set(auth(token)).send(orderBody(overrides));
};

beforeEach(() => {
  newsletterService.subscribe.mockReset();
  newsletterService.subscribe.mockResolvedValue({ status: "subscribed" });
});

describe("checkout newsletter opt-in", () => {
  it("signs the contact email up when the box is ticked", async () => {
    const { user, token } = await createUser();

    const res = await placeOrder(token, user, { subscribeNewsletter: true });

    expect(res.status).toBe(201);
    expect(newsletterService.subscribe).toHaveBeenCalledWith("customer@example.com");
  });

  it("does nothing when the box is not ticked", async () => {
    const { user, token } = await createUser();

    const res = await placeOrder(token, user, { subscribeNewsletter: false });

    expect(res.status).toBe(201);
    expect(newsletterService.subscribe).not.toHaveBeenCalled();
  });

  it("still places the order when the newsletter service is down", async () => {
    newsletterService.subscribe.mockRejectedValue(new Error("Brevo is down"));
    const { user, token } = await createUser();

    const res = await placeOrder(token, user, { subscribeNewsletter: true });

    expect(res.status).toBe(201);
  });

  it("leaves the public demo accounts out of the real mailing list", async () => {
    const saved = process.env.DEMO_ACCOUNTS_ENABLED;
    process.env.DEMO_ACCOUNTS_ENABLED = "true";
    await seedDemoAccounts();
    const login = await request(app).post("/api/users/demo-login").send({ role: "customer" });
    const User = require("../model/User");
    const demo = await User.findOne({ isDemo: true, role: "user" });

    const res = await placeOrder(login.body.token, demo, { subscribeNewsletter: true });

    expect(res.status).toBe(201);
    expect(newsletterService.subscribe).not.toHaveBeenCalled();
    if (saved === undefined) delete process.env.DEMO_ACCOUNTS_ENABLED;
    else process.env.DEMO_ACCOUNTS_ENABLED = saved;
  });
});

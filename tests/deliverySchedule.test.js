const request = require("supertest");

const app = require("../app");
const {
  slotStartHour,
  slotStartInstant,
  checkDeliverySchedule,
  NEPAL_OFFSET_MS,
} = require("../utils/deliverySchedule");
const { createUser, createCake, createCartWithItem, auth } = require("./helpers/factories");

const SLOT = "09:00 AM - 12:00 PM";

describe("slotStartHour", () => {
  it("reads the start of each slot in 24-hour time", () => {
    expect(slotStartHour("09:00 AM - 12:00 PM")).toBe(9);
    expect(slotStartHour("12:00 PM - 03:00 PM")).toBe(12);
    expect(slotStartHour("03:00 PM - 06:00 PM")).toBe(15);
  });
});

describe("slotStartInstant", () => {
  it("reads the booked day in Nepal time, wherever the browser was", () => {
    // Midday UTC on 10 Oct is 5:45pm in Nepal, still 10 Oct
    const start = slotStartInstant("2026-10-10T12:00:00.000Z", SLOT);
    expect(start.getTime()).toBe(Date.UTC(2026, 9, 10, 9) - NEPAL_OFFSET_MS);
  });

  it("still means 10 Oct when the browser sent local midnight in Nepal (the old format)", () => {
    // 10 Oct 00:00 in Nepal is 9 Oct 18:15 UTC
    const start = slotStartInstant("2026-10-09T18:15:00.000Z", SLOT);
    expect(start.getTime()).toBe(Date.UTC(2026, 9, 10, 9) - NEPAL_OFFSET_MS);
  });
});

describe("checkDeliverySchedule", () => {
  const now = new Date("2026-10-10T06:00:00.000Z"); // 11:45am in Nepal

  it("accepts a slot at least 24 hours away", () => {
    expect(checkDeliverySchedule("2026-10-12T12:00:00.000Z", SLOT, now)).toBeNull();
  });

  it("rejects a day in the past", () => {
    expect(checkDeliverySchedule("2026-10-01T12:00:00.000Z", SLOT, now)).toMatch(/24 hours/);
  });

  it("rejects a slot less than 24 hours away", () => {
    // Tomorrow 9am Nepal is only about 21 hours from 11:45am today
    expect(checkDeliverySchedule("2026-10-11T12:00:00.000Z", SLOT, now)).toMatch(/24 hours/);
  });

  it("accepts tomorrow's later slot once it is far enough away", () => {
    // Tomorrow 3pm Nepal is 27 hours from 11:45am today
    expect(
      checkDeliverySchedule("2026-10-11T12:00:00.000Z", "03:00 PM - 06:00 PM", now)
    ).toBeNull();
  });

  it("rejects a date too far ahead", () => {
    expect(checkDeliverySchedule("2027-06-01T12:00:00.000Z", SLOT, now)).toMatch(/90 days/);
  });
});

describe("POST /api/orders delivery rules", () => {
  const body = (date) => ({
    contactEmail: "customer@example.com",
    shippingAddress: {
      firstName: "Test",
      lastName: "Customer",
      address: "12 Test Road",
      city: "Kathmandu",
      phone: "9800000000",
    },
    deliverySchedule: { date, timeSlot: SLOT },
    paymentMethod: "cod",
  });

  it("refuses a delivery booked in the past", async () => {
    const { user, token } = await createUser();
    await createCartWithItem(user._id, await createCake(), 1);

    const res = await request(app)
      .post("/api/orders")
      .set(auth(token))
      .send(body(new Date(Date.now() - 2 * 86400000).toISOString()));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/24 hours/);
  });

  it("accepts a delivery with enough notice", async () => {
    const { user, token } = await createUser();
    await createCartWithItem(user._id, await createCake(), 1);

    const res = await request(app)
      .post("/api/orders")
      .set(auth(token))
      .send(body(new Date(Date.now() + 3 * 86400000).toISOString()));

    expect(res.status).toBe(201);
  });
});

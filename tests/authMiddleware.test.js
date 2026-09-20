const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const User = require("../model/User");
const { createUser, auth, signToken, objectId } = require("./helpers/factories");

// /api/users/profile is just a convenient route behind `protect`; these tests
// are about the middleware, not the handler.
const PROTECTED = "/api/users/profile";

describe("protect middleware", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await request(app).get(PROTECTED);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/no token/i);
  });

  it("rejects a malformed Authorization header", async () => {
    const res = await request(app)
      .get(PROTECTED)
      .set({ Authorization: "some-token-without-the-bearer-prefix" });

    expect(res.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const { user } = await createUser();
    const forged = jwt.sign({ id: user._id.toString() }, "not-the-real-secret");

    const res = await request(app).get(PROTECTED).set(auth(forged));

    expect(res.status).toBe(401);
  });

  it("rejects a tampered token", async () => {
    const { user } = await createUser();
    const [header, payload, signature] = signToken(user._id).split(".");
    const tampered = `${header}.${payload}.${"x".repeat(signature.length)}`;

    const res = await request(app).get(PROTECTED).set(auth(tampered));

    expect(res.status).toBe(401);
  });

  it("rejects an expired token with a distinguishable message", async () => {
    const { user } = await createUser();
    const expired = jwt.sign(
      { id: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: "-1s" }
    );

    const res = await request(app).get(PROTECTED).set(auth(expired));

    expect(res.status).toBe(401);
    // The client needs to tell "log in again" apart from "something is wrong".
    expect(res.body.message).toMatch(/expired/i);
  });

  it("accepts a valid token", async () => {
    const { token } = await createUser();

    const res = await request(app).get(PROTECTED).set(auth(token));

    expect(res.status).toBe(200);
  });

  it("rejects a token for a deleted user", async () => {
    const res = await request(app).get(PROTECTED).set(auth(signToken(objectId())));

    expect(res.status).toBe(401);
  });
});

describe("token revocation via passwordChangedAt", () => {
  it("rejects a token issued before the password changed", async () => {
    const { user, token } = await createUser();

    // Confirm the token works first, so the assertion below means something.
    const before = await request(app).get(PROTECTED).set(auth(token));
    expect(before.status).toBe(200);

    // Simulate a password change one minute from now. Using a future date
    // sidesteps the one-second resolution of the JWT `iat` claim, which would
    // otherwise make this test timing-dependent and flaky.
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordChangedAt: new Date(Date.now() + 60_000) } }
    );

    const after = await request(app).get(PROTECTED).set(auth(token));

    expect(after.status).toBe(401);
    expect(after.body.message).toMatch(/log in again/i);
  });

  it("still accepts a token issued after the password changed", async () => {
    const { user } = await createUser();

    await User.updateOne(
      { _id: user._id },
      { $set: { passwordChangedAt: new Date(Date.now() - 60_000) } }
    );

    const freshToken = signToken(user._id);
    const res = await request(app).get(PROTECTED).set(auth(freshToken));

    expect(res.status).toBe(200);
  });

  it("accepts tokens for users who have never changed their password", async () => {
    const { token } = await createUser();

    const res = await request(app).get(PROTECTED).set(auth(token));

    expect(res.status).toBe(200);
  });
});

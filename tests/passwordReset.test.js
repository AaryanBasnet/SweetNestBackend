const request = require("supertest");

const app = require("../app");
const User = require("../model/User");
const PasswordResetToken = require("../model/PasswordResetToken");
const { createUser } = require("./helpers/factories");
const { __getSentEmails } = require("./mocks/email");

/**
 * Creates a reset token for a user and hands back the plaintext code, the way
 * the real flow hands it to the user's inbox.
 */
const issueCode = async (user) => {
  const code = PasswordResetToken.generateCode();
  await PasswordResetToken.create({
    userId: user._id,
    email: user.email,
    codeHash: PasswordResetToken.hashCode(code),
  });
  return code;
};

const wrongCodeFor = (code) => (code === "111111" ? "222222" : "111111");

describe("code generation", () => {
  it("produces six digits", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(PasswordResetToken.generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("does not repeat itself in any obvious way", () => {
    // A weak generator (Math.random seeded per tick, an off-by-one range)
    // shows up here as a collapsed range of values.
    const codes = new Set();
    for (let i = 0; i < 2000; i += 1) codes.add(PasswordResetToken.generateCode());

    expect(codes.size).toBeGreaterThan(1900);
  });

  it("stores only a keyed hash, never the code itself", async () => {
    const { user } = await createUser();
    const code = await issueCode(user);

    const stored = await PasswordResetToken.findOne({ email: user.email }).lean();

    expect(stored.codeHash).not.toBe(code);
    expect(stored.codeHash).toHaveLength(64);
    expect(stored.code).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain(code);
  });
});

describe("POST /api/users/forgot-password", () => {
  it("sends a code to a real account", async () => {
    const { user } = await createUser();

    const res = await request(app)
      .post("/api/users/forgot-password")
      .send({ email: user.email });

    expect(res.status).toBe(200);
    expect(__getSentEmails()).toHaveLength(1);
    expect(__getSentEmails()[0].email).toBe(user.email);
  });

  it("answers identically for an unknown account and sends nothing", async () => {
    const { user } = await createUser();

    const known = await request(app)
      .post("/api/users/forgot-password")
      .send({ email: user.email });

    const unknown = await request(app)
      .post("/api/users/forgot-password")
      .send({ email: "no-such-person@example.com" });

    // Same status and same body: no enumeration oracle.
    expect(unknown.status).toBe(known.status);
    expect(unknown.body.message).toBe(known.body.message);

    // ...but only the real account actually got an email.
    expect(__getSentEmails()).toHaveLength(1);
    expect(__getSentEmails()[0].email).toBe(user.email);
  });

  it("invalidates a previously issued code", async () => {
    const { user } = await createUser();
    const firstCode = await issueCode(user);

    await request(app)
      .post("/api/users/forgot-password")
      .send({ email: user.email });

    const res = await request(app)
      .post("/api/users/verify-reset-code")
      .send({ email: user.email, code: firstCode });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/users/verify-reset-code", () => {
  it("accepts the correct code", async () => {
    const { user } = await createUser();
    const code = await issueCode(user);

    const res = await request(app)
      .post("/api/users/verify-reset-code")
      .send({ email: user.email, code });

    expect(res.status).toBe(200);
  });

  it("rejects a wrong code and counts the attempt", async () => {
    const { user } = await createUser();
    const code = await issueCode(user);

    const res = await request(app)
      .post("/api/users/verify-reset-code")
      .send({ email: user.email, code: wrongCodeFor(code) });

    expect(res.status).toBe(400);

    const stored = await PasswordResetToken.findOne({ email: user.email });
    expect(stored.attempts).toBe(1);
  });

  it("destroys the token after five wrong attempts", async () => {
    const { user } = await createUser();
    const code = await issueCode(user);
    const wrong = wrongCodeFor(code);

    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post("/api/users/verify-reset-code")
        .send({ email: user.email, code: wrong });
    }

    expect(await PasswordResetToken.findOne({ email: user.email })).toBeNull();
  });

  it("makes even the correct code useless once the token is burned", async () => {
    const { user } = await createUser();
    const code = await issueCode(user);
    const wrong = wrongCodeFor(code);

    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post("/api/users/verify-reset-code")
        .send({ email: user.email, code: wrong });
    }

    const res = await request(app)
      .post("/api/users/verify-reset-code")
      .send({ email: user.email, code });

    expect(res.status).toBe(400);
  });

  it("rejects an expired code", async () => {
    const { user } = await createUser();
    const code = await issueCode(user);

    await PasswordResetToken.updateOne(
      { email: user.email },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const res = await request(app)
      .post("/api/users/verify-reset-code")
      .send({ email: user.email, code });

    expect(res.status).toBe(400);
  });

  it("does not reveal whether the account exists", async () => {
    const res = await request(app)
      .post("/api/users/verify-reset-code")
      .send({ email: "nobody@example.com", code: "123456" });

    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/no account|not found|does not exist/i);
  });
});

describe("POST /api/users/reset-password", () => {
  it("changes the password after the code is verified", async () => {
    const { user, password } = await createUser();
    const code = await issueCode(user);

    await request(app)
      .post("/api/users/verify-reset-code")
      .send({ email: user.email, code });

    const res = await request(app).post("/api/users/reset-password").send({
      email: user.email,
      code,
      newPassword: "ResetPassw0rd!",
    });

    expect(res.status).toBe(200);

    const stored = await User.findById(user._id).select("+password");
    expect(await stored.matchPassword("ResetPassw0rd!")).toBe(true);
    expect(await stored.matchPassword(password)).toBe(false);
  });

  it("refuses when the code was never verified", async () => {
    const { user } = await createUser();
    const code = await issueCode(user);

    const res = await request(app).post("/api/users/reset-password").send({
      email: user.email,
      code,
      newPassword: "ResetPassw0rd!",
    });

    expect(res.status).toBe(400);
  });

  it("refuses a different code than the one verified", async () => {
    const { user } = await createUser();
    const code = await issueCode(user);

    await request(app)
      .post("/api/users/verify-reset-code")
      .send({ email: user.email, code });

    const res = await request(app).post("/api/users/reset-password").send({
      email: user.email,
      code: wrongCodeFor(code),
      newPassword: "ResetPassw0rd!",
    });

    expect(res.status).toBe(400);
  });

  it("consumes the token so it cannot be reused", async () => {
    const { user } = await createUser();
    const code = await issueCode(user);

    await request(app)
      .post("/api/users/verify-reset-code")
      .send({ email: user.email, code });
    await request(app).post("/api/users/reset-password").send({
      email: user.email,
      code,
      newPassword: "ResetPassw0rd!",
    });

    const second = await request(app).post("/api/users/reset-password").send({
      email: user.email,
      code,
      newPassword: "AnotherPassw0rd!",
    });

    expect(second.status).toBe(400);
  });

  it("stamps passwordChangedAt, revoking tokens issued before the reset", async () => {
    const { user } = await createUser();
    const code = await issueCode(user);

    await request(app)
      .post("/api/users/verify-reset-code")
      .send({ email: user.email, code });
    await request(app).post("/api/users/reset-password").send({
      email: user.email,
      code,
      newPassword: "ResetPassw0rd!",
    });

    const stored = await User.findById(user._id);
    expect(stored.passwordChangedAt).toBeInstanceOf(Date);
  });

  it("enforces password strength on the new password", async () => {
    const { user } = await createUser();
    const code = await issueCode(user);

    await request(app)
      .post("/api/users/verify-reset-code")
      .send({ email: user.email, code });

    const res = await request(app)
      .post("/api/users/reset-password")
      .send({ email: user.email, code, newPassword: "weak" });

    expect(res.status).toBe(400);
  });
});

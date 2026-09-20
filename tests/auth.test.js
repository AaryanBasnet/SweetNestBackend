const request = require("supertest");
const app = require("../app");
const User = require("../model/User");
const {
  createUser,
  createAdmin,
  auth,
  signToken,
  VALID_PASSWORD,
  objectId,
} = require("./helpers/factories");

describe("POST /api/users/register", () => {
  it("creates a user and returns a token", async () => {
    const res = await request(app).post("/api/users/register").send({
      name: "New Customer",
      email: "new-customer@example.com",
      password: VALID_PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.userData.email).toBe("new-customer@example.com");
  });

  it("never lets a client choose its own role", async () => {
    // Privilege escalation attempt: ask for admin during public signup.
    const res = await request(app).post("/api/users/register").send({
      name: "Sneaky",
      email: "sneaky@example.com",
      password: VALID_PASSWORD,
      role: "admin",
    });

    expect(res.status).toBe(201);
    expect(res.body.userData.role).toBe("user");

    const stored = await User.findOne({ email: "sneaky@example.com" });
    expect(stored.role).toBe("user");
  });

  it("does not return the password hash", async () => {
    const res = await request(app).post("/api/users/register").send({
      name: "Private",
      email: "private@example.com",
      password: VALID_PASSWORD,
    });

    expect(JSON.stringify(res.body)).not.toMatch(/\$2[ab]\$/);
    expect(res.body.userData.password).toBeUndefined();
  });

  it("rejects a duplicate email", async () => {
    await createUser({ email: "taken@example.com" });

    const res = await request(app).post("/api/users/register").send({
      name: "Copycat",
      email: "taken@example.com",
      password: VALID_PASSWORD,
    });

    expect(res.status).toBe(400);
  });

  it("rejects a weak password", async () => {
    const res = await request(app).post("/api/users/register").send({
      name: "Weak",
      email: "weak@example.com",
      password: "password",
    });

    expect(res.status).toBe(400);
  });

  // This is the regression test for the Zod v4 `.errors` -> `.issues` bug.
  // The old code answered every validation failure with an empty array, so the
  // frontend could never say which field was wrong.
  it("reports which fields failed validation", async () => {
    const res = await request(app)
      .post("/api/users/register")
      .send({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);

    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain("email");
    expect(fields).toContain("password");

    // Field names must not carry the 'body.' prefix the validator adds
    // internally - the frontend matches them against its own input names.
    fields.forEach((field) => expect(field).not.toMatch(/^body\./));
  });
});

describe("POST /api/users/login", () => {
  it("returns a token for correct credentials", async () => {
    const { user, password } = await createUser();

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it("rejects a wrong password", async () => {
    const { user } = await createUser();

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password: "WrongPassw0rd!" });

    expect(res.status).toBe(401);
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    // Different messages here would tell an attacker which emails are
    // registered, which is the enumeration leak we closed on forgot-password.
    const { user } = await createUser();

    const wrongPassword = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password: "WrongPassw0rd!" });

    const unknownUser = await request(app)
      .post("/api/users/login")
      .send({ email: "nobody-here@example.com", password: "WrongPassw0rd!" });

    expect(wrongPassword.status).toBe(unknownUser.status);
    expect(wrongPassword.body.message).toBe(unknownUser.body.message);
  });

  it("does not leak the password hash on success", async () => {
    const { user, password } = await createUser();

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password });

    expect(JSON.stringify(res.body)).not.toMatch(/\$2[ab]\$/);
  });
});

describe("password storage", () => {
  it("stores a bcrypt hash, never the plaintext", async () => {
    const { user, password } = await createUser();

    const stored = await User.findById(user._id).select("+password");

    expect(stored.password).not.toBe(password);
    expect(stored.password).toMatch(/^\$2[ab]\$/);
  });

  it("is excluded from queries by default", async () => {
    const { user } = await createUser();

    const stored = await User.findById(user._id);

    expect(stored.password).toBeUndefined();
  });
});

describe("PUT /api/users/profile - changing a password", () => {
  it("refuses without the current password", async () => {
    const { token } = await createUser();

    const res = await request(app)
      .put("/api/users/profile")
      .set(auth(token))
      .send({ password: "BrandNewPass1!" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/current password/i);
  });

  it("refuses with the wrong current password", async () => {
    const { token } = await createUser();

    const res = await request(app)
      .put("/api/users/profile")
      .set(auth(token))
      .send({ currentPassword: "NotTheOne1!", password: "BrandNewPass1!" });

    expect(res.status).toBe(401);
  });

  it("leaves the password untouched after a refused attempt", async () => {
    const { user, token, password } = await createUser();

    await request(app)
      .put("/api/users/profile")
      .set(auth(token))
      .send({ currentPassword: "NotTheOne1!", password: "BrandNewPass1!" });

    const stored = await User.findById(user._id).select("+password");
    expect(await stored.matchPassword(password)).toBe(true);
  });

  it("succeeds with the correct current password", async () => {
    const { user, token, password } = await createUser();

    const res = await request(app)
      .put("/api/users/profile")
      .set(auth(token))
      .send({ currentPassword: password, password: "BrandNewPass1!" });

    expect(res.status).toBe(200);

    const stored = await User.findById(user._id).select("+password");
    expect(await stored.matchPassword("BrandNewPass1!")).toBe(true);
  });

  it("stamps passwordChangedAt so older tokens stop working", async () => {
    const { user, token, password } = await createUser();

    await request(app)
      .put("/api/users/profile")
      .set(auth(token))
      .send({ currentPassword: password, password: "BrandNewPass1!" });

    const stored = await User.findById(user._id);
    expect(stored.passwordChangedAt).toBeInstanceOf(Date);
  });

  it("never lets the profile update change the role", async () => {
    const { user, token } = await createUser();

    await request(app)
      .put("/api/users/profile")
      .set(auth(token))
      .send({ name: "Renamed", role: "admin" });

    const stored = await User.findById(user._id);
    expect(stored.role).toBe("user");
  });
});

describe("admin-only routes", () => {
  it("rejects a normal user", async () => {
    const { token } = await createUser();

    const res = await request(app).get("/api/users/customers").set(auth(token));

    expect(res.status).toBe(403);
  });

  it("allows an admin", async () => {
    const { token } = await createAdmin();

    const res = await request(app).get("/api/users/customers").set(auth(token));

    expect(res.status).toBe(200);
  });

  it("rejects a token whose user no longer exists", async () => {
    // Deleted account, token still in someone's browser.
    const orphanToken = signToken(objectId());

    const res = await request(app)
      .get("/api/users/profile")
      .set(auth(orphanToken));

    expect(res.status).toBe(401);
  });
});

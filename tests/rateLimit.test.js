/**
 * Rate limiter tests.
 *
 * The limiters read NODE_ENV when the module is first required, and loosen
 * their limits 20x outside production so they do not get in the way during
 * development. To test the real production numbers, the module is re-required
 * in an isolated registry with NODE_ENV forced to "production".
 *
 * These are unit tests around the middleware rather than tests through the
 * full app, because the app also reads NODE_ENV at import time and one test
 * file cannot hold it at two values at once.
 */

const express = require("express");
const request = require("supertest");

/** Builds a tiny app around one limiter, loaded in production mode. */
const appWithLimiter = (limiterName, { handlerStatus = 401 } = {}) => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  let limiter;
  jest.isolateModules(() => {
    limiter = require("../middleware/rateLimitMiddleware")[limiterName];
  });

  process.env.NODE_ENV = previousEnv;

  const app = express();
  app.use(express.json());
  app.post("/probe", limiter, (req, res) =>
    res.status(handlerStatus).json({ ok: handlerStatus < 400 })
  );
  return app;
};

const hit = (app, body = {}) => request(app).post("/probe").send(body);

describe("authLimiter", () => {
  it("blocks repeated failed logins for one account", async () => {
    const app = appWithLimiter("authLimiter");
    const credentials = { email: "victim@example.com", password: "wrong" };

    const statuses = [];
    for (let i = 0; i < 13; i += 1) {
      statuses.push((await hit(app, credentials)).status);
    }

    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses[0]).toBe(401);
  });

  it("does not lock out a different account from the same address", async () => {
    // Keying on IP alone would let one attacker deny service to everybody.
    const app = appWithLimiter("authLimiter");

    for (let i = 0; i < 13; i += 1) {
      await hit(app, { email: "victim@example.com", password: "wrong" });
    }

    const other = await hit(app, {
      email: "someone-else@example.com",
      password: "wrong",
    });

    expect(other.status).toBe(401);
  });

  it("does not count successful logins toward the limit", async () => {
    // skipSuccessfulRequests: a busy legitimate user must not lock themselves
    // out just by signing in often.
    const app = appWithLimiter("authLimiter", { handlerStatus: 200 });
    const credentials = { email: "regular@example.com", password: "right" };

    const statuses = [];
    for (let i = 0; i < 15; i += 1) {
      statuses.push((await hit(app, credentials)).status);
    }

    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it("returns a JSON body and a RateLimit header when it blocks", async () => {
    const app = appWithLimiter("authLimiter");
    const credentials = { email: "victim2@example.com", password: "wrong" };

    let blocked;
    for (let i = 0; i < 13; i += 1) {
      blocked = await hit(app, credentials);
    }

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.message).toMatch(/too many/i);
    // standardHeaders: "draft-7" emits a single combined RateLimit header
    // ("limit=10, remaining=0, reset=900"), not the older RateLimit-Limit trio.
    expect(blocked.headers["ratelimit"]).toMatch(/limit=\d+/);
  });
});

describe("passwordResetRequestLimiter", () => {
  it("caps how many reset emails one address can trigger", async () => {
    const app = appWithLimiter("passwordResetRequestLimiter", {
      handlerStatus: 200,
    });
    const body = { email: "target@example.com" };

    const statuses = [];
    for (let i = 0; i < 8; i += 1) {
      statuses.push((await hit(app, body)).status);
    }

    expect(statuses).toContain(429);
  });
});

describe("passwordResetVerifyLimiter", () => {
  it("caps guesses at the six-digit code", async () => {
    const app = appWithLimiter("passwordResetVerifyLimiter", {
      handlerStatus: 400,
    });
    const body = { email: "target@example.com", code: "000000" };

    const statuses = [];
    for (let i = 0; i < 13; i += 1) {
      statuses.push((await hit(app, body)).status);
    }

    expect(statuses).toContain(429);
  });
});

describe("contactLimiter", () => {
  it("caps submissions to the public contact form", async () => {
    const app = appWithLimiter("contactLimiter", { handlerStatus: 201 });

    const statuses = [];
    for (let i = 0; i < 8; i += 1) {
      statuses.push((await hit(app)).status);
    }

    expect(statuses).toContain(429);
  });
});

describe("development behaviour", () => {
  it("loosens the limits outside production so they do not obstruct dev work", async () => {
    // Loaded with NODE_ENV as the test runner sets it ("test"), so the 20x
    // scaling applies and a handful of requests sails through.
    const { authLimiter } = require("../middleware/rateLimitMiddleware");

    const app = express();
    app.use(express.json());
    app.post("/probe", authLimiter, (req, res) => res.status(401).json({}));

    const statuses = [];
    for (let i = 0; i < 15; i += 1) {
      statuses.push(
        (await request(app).post("/probe").send({ email: "dev@example.com" }))
          .status
      );
    }

    expect(statuses.every((s) => s === 401)).toBe(true);
  });
});

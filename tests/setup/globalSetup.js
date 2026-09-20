/**
 * Runs once, before the whole suite.
 *
 * Provides a MongoDB for the tests to use and publishes its URI on
 * process.env, which Jest propagates to the test workers.
 */

const { MongoMemoryServer } = require("mongodb-memory-server");

module.exports = async () => {
  // Make the test environment explicit and self-contained. Tests must never
  // depend on a developer's .env, or they pass on one machine and fail on
  // another - and worse, they could point at a real database.
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-jwt-secret-not-used-anywhere-real";
  process.env.JWT_EXPIRES_IN = "1h";
  process.env.FRONTEND_URL = "http://localhost:5173";
  process.env.BACKEND_URL = "http://localhost:5000";
  process.env.ESEWA_MERCHANT_ID = "EPAYTEST";
  process.env.ESEWA_SECRET_KEY = "test-esewa-secret";

  if (process.env.MONGO_TEST_URI) {
    // CI path: a mongo service container is already running.
    process.env.MONGO_URI = process.env.MONGO_TEST_URI;
    return;
  }

  // Local path: ephemeral in-memory mongod, discarded when the run ends.
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  // Stash the handle so globalTeardown can stop it. globalSetup and
  // globalTeardown run in the same process, so a global works here.
  globalThis.__MONGOD__ = mongod;
};

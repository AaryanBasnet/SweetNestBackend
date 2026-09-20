/**
 * Jest configuration.
 *
 * Tests run against a real MongoDB, not a mocked one. Mocking the database
 * would let query bugs (wrong operator, missing index, a condition that does
 * not do what you think) pass the suite - which is exactly the class of bug
 * these tests exist to catch.
 *
 * Where that database comes from:
 *   - CI sets MONGO_TEST_URI, pointing at a mongo service container.
 *   - Locally, globalSetup spins up an ephemeral in-memory mongod.
 */

module.exports = {
  testEnvironment: "node",

  globalSetup: "<rootDir>/tests/setup/globalSetup.js",
  globalTeardown: "<rootDir>/tests/setup/globalTeardown.js",
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jest.setup.js"],

  testMatch: ["<rootDir>/tests/**/*.test.js"],

  // Sending real email in a test would be both slow and rude. The stub also
  // records what "would" have been sent, so tests can assert on it.
  moduleNameMapper: {
    "^.*config/email$": "<rootDir>/tests/mocks/email.js",
  },

  // All test files share one database, and each test clears the collections
  // it dirtied. Running files in parallel would let them clobber each other,
  // so the suite is serial. It is fast enough at this size; if it stops being
  // fast enough, give each worker its own database name instead.
  maxWorkers: 1,

  // Starting mongod and hashing bcrypt passwords is not instant.
  testTimeout: 30000,

  collectCoverageFrom: [
    "controller/**/*.js",
    "middleware/**/*.js",
    "model/**/*.js",
    "utils/**/*.js",
    "validators/**/*.js",
    "app.js",
  ],

  coverageReporters: ["text-summary", "lcov"],

  /**
   * A ratchet, not a target.
   *
   * The global numbers are set just below where the suite currently sits, so
   * they fail if coverage slips - and get raised as more of the app (analytics,
   * notifications, promotions, wishlist) gains tests.
   *
   * The per-file entries are the real point: the code that handles money and
   * authentication is held to a much higher bar than the average of the
   * codebase, because that is where a regression actually costs something.
   *
   * GOTCHA: a file named in its own threshold is REMOVED from the global pool.
   * Pulling the well-covered payment and auth files out is why the global
   * numbers below (~38%) look lower than the headline summary (~45%) - the
   * global group is everything that is left over.
   */
  coverageThreshold: {
    global: {
      statements: 36,
      branches: 15,
      functions: 32,
      lines: 37,
    },
    "./controller/esewaController.js": {
      statements: 85,
      branches: 65,
      lines: 85,
    },
    "./middleware/authMiddleware.js": {
      statements: 100,
      branches: 100,
      lines: 100,
    },
    "./controller/userController.js": {
      statements: 70,
      lines: 70,
    },
  },

  clearMocks: true,
};

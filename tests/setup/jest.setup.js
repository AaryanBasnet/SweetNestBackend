/**
 * Runs before each test FILE (setupFilesAfterEnv).
 *
 * Owns the mongoose connection lifecycle and, critically, test isolation:
 * every test starts against empty collections. Tests that depend on leftovers
 * from a previous test are the main reason suites become flaky and then get
 * ignored.
 */

const mongoose = require("mongoose");

// The app logs a fair amount on expected error paths (rejected signatures,
// failed lookups). That noise buries real failures, so it is silenced by
// default. Set DEBUG_TESTS=1 to get it back while diagnosing something.
if (!process.env.DEBUG_TESTS) {
  global.console.log = jest.fn();
  global.console.warn = jest.fn();
  global.console.error = jest.fn();
}

beforeAll(async () => {
  if (!process.env.MONGO_URI) {
    throw new Error(
      "MONGO_URI is not set. globalSetup should have started a database " +
        "(or CI should have provided MONGO_TEST_URI)."
    );
  }

  // Fail fast rather than letting mongoose buffer operations until the hook
  // times out. A hung 30s hook tells you nothing; a connection error names
  // the actual problem.
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
  });
});

afterEach(async () => {
  // Clear rather than drop: dropping would also destroy the indexes, and some
  // behaviour under test (the unique constraint on user email, the unique
  // compound index on reviews) only exists because of those indexes.
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );

  const { __clearSentEmails } = require("../mocks/email");
  __clearSentEmails();
});

afterAll(async () => {
  await mongoose.connection.close();
});

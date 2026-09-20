/**
 * Runs once, after the whole suite. Stops the ephemeral mongod if we started
 * one. (When MONGO_TEST_URI is set, CI owns the database and we leave it be.)
 */

module.exports = async () => {
  if (globalThis.__MONGOD__) {
    await globalThis.__MONGOD__.stop();
  }
};

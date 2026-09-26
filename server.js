/**
 * Process entry point.
 *
 * Responsibilities kept here (and deliberately out of app.js, so the app stays
 * importable by tests): configuration validation, database connection,
 * listening on a port, and graceful shutdown.
 */

const dotenv = require("dotenv");
dotenv.config();

// Must run before ./app is required: the SDK patches modules at require time,
// so anything imported earlier would not be instrumented. No-op without a DSN.
const { initSentry } = require("./config/sentry");
initSentry();

const mongoose = require("mongoose");

const app = require("./app");
const logger = require("./config/logger");
const connectDB = require("./config/db");
const seedHeroCakes = require("./utils/seedHeroCakes");

const isProd = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------
// Fail fast on missing configuration.
// A missing JWT_SECRET used to surface as a confusing 500 on the first login;
// crashing at boot makes a broken deploy obvious immediately.
// ---------------------------------------------------------------------------
// NOTE: these two checks use console.error rather than the logger on
// purpose. pino writes through an async transport (and to an async stream in
// production), so a message logged immediately before process.exit() can be
// lost before it is flushed. console.error is synchronous, and a config
// failure is exactly the message you cannot afford to drop.
const REQUIRED_ENV = ["DB_URL", "JWT_SECRET"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnv.join(", ")}`
  );
  process.exit(1);
}

if (isProd && !process.env.FRONTEND_URL) {
  console.error("FRONTEND_URL must be set in production (CORS allowlist)");
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

/**
 * Connect to the database BEFORE accepting traffic, then start listening.
 * The original version called listen() immediately and connected in a
 * floating promise, so the server answered requests it could not serve.
 */
const start = async () => {
  try {
    await connectDB();
    await seedHeroCakes();
  } catch (error) {
    // Same reasoning as the config checks above: synchronous, because the
    // process is about to end.
    console.error("Startup failed:", error.message);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    // No `env` field here - the logger's `base` already stamps it on every
    // line, and passing it again produced a duplicate key in the JSON output.
    logger.info({ port: PORT }, "Server listening");
  });

  // Graceful shutdown: stop taking new connections, let in-flight requests
  // finish, then close the database. Without this, a deploy can kill a
  // request midway through writing an order.
  const shutdown = async (signal) => {
    logger.info({ signal }, "Shutting down gracefully");

    server.close(async () => {
      await mongoose.connection.close(false);
      logger.info("Shutdown complete");
      process.exit(0);
    });

    // Do not hang forever if a connection refuses to drain.
    setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // A rejected promise nobody handled means the process is in an unknown
  // state. Log it and exit so the supervisor restarts a clean one.
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "Unhandled promise rejection");
    shutdown("unhandledRejection");
  });

  // An uncaught exception leaves the process in an undefined state. Log it
  // and let the supervisor restart something clean, rather than limping on.
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    shutdown("uncaughtException");
  });
};

start();

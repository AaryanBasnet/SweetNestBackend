/**
 * Application logger.
 *
 * Why not console.log
 * -------------------
 * console.log writes unstructured text. Once the app is deployed, logs are
 * read by a machine before a human ever sees them - you search them, filter
 * them, and alert on them. "Order 123 paid" is a sentence; you cannot query
 * for "all failed payments over Rs 5000 in the last hour" across sentences.
 *
 * pino writes one JSON object per line instead:
 *
 *   {"level":30,"time":1699...,"reqId":"a1b2","orderId":"...","msg":"payment settled"}
 *
 * which any log platform can index. In development that is unreadable, so
 * pino-pretty turns it back into coloured text for humans.
 *
 * Levels, in the order you should reach for them:
 *   fatal - the process cannot continue
 *   error - an operation failed and someone should look
 *   warn  - suspicious but handled (a rejected signature, a retry)
 *   info  - significant business events (order placed, payment settled)
 *   debug - detail for diagnosing, off in production
 */

const pino = require("pino");

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

/**
 * Anything listed here is replaced with [Redacted] before it is written.
 *
 * This matters more than it looks. Logs get shipped to third-party services,
 * shown in dashboards, and pasted into chat threads. A password or a bearer
 * token in a log line is a credential leak with a long tail - it survives in
 * backups and indexes long after you delete the line.
 */
const redact = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "*.password",
    "*.currentPassword",
    "*.newPassword",
    "*.token",
    "*.codeHash",
    "*.secretKey",
    "*.signature",
    "password",
    "token",
  ],
  censor: "[Redacted]",
};

const logger = pino({
  level:
    process.env.LOG_LEVEL || (isTest ? "silent" : isProd ? "info" : "debug"),

  redact,

  // ISO timestamps rather than epoch millis - worth the few bytes when a
  // human is reading a production log at 3am.
  timestamp: pino.stdTimeFunctions.isoTime,

  formatters: {
    // Log the level as "info" rather than the numeric 30, so the JSON is
    // readable without a lookup table.
    level: (label) => ({ level: label }),
  },

  base: {
    service: "sweetnest-api",
    env: process.env.NODE_ENV || "development",
  },

  // Human-readable output locally; raw JSON in production, where a log
  // collector is the consumer.
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname,service,env",
        },
      },
});

module.exports = logger;

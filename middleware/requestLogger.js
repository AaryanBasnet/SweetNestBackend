/**
 * HTTP request logging.
 *
 * Gives every request a unique id and attaches a child logger to req.log that
 * already carries it. Anything logged during that request is automatically
 * stamped with the same reqId, so when a customer says "my payment failed at
 * 3pm" you can pull every line for that one request out of thousands.
 *
 * Without a request id, concurrent requests interleave in the log and you are
 * left guessing which line belongs to which user.
 */

const crypto = require("crypto");
const pinoHttp = require("pino-http");

const logger = require("../config/logger");

const requestLogger = pinoHttp({
  logger,

  // Reuse an upstream id when a proxy or gateway already assigned one, so a
  // trace survives across service boundaries. Otherwise mint our own.
  genReqId(req, res) {
    const existing = req.headers["x-request-id"];
    const id = existing || crypto.randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },

  // Health checks run every few seconds forever. Logging them buries the
  // lines that matter.
  autoLogging: {
    ignore: (req) => req.url === "/health" || req.url === "/ready",
  },

  // A 404 or a rejected login is not an application error - it is the API
  // doing its job. Only 5xx deserves error level, or the noise trains you to
  // ignore real failures.
  customLogLevel(req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },

  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },

  customErrorMessage(req, res, err) {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },

  // Log a useful subset rather than the whole req/res, which are enormous and
  // full of circular references.
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        // Useful for rate-limit and abuse investigations.
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});

module.exports = requestLogger;

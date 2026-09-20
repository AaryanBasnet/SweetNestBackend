/**
 * Express application.
 *
 * This module builds and exports the configured app WITHOUT listening on a
 * port. Keeping "what the app is" separate from "how the process runs it" is
 * what makes the API testable: supertest can drive this object directly, in
 * memory, with no socket and no port conflicts.
 *
 * server.js is the process entry point - it validates config, connects the
 * database, listens, and handles shutdown.
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const mongoose = require("mongoose");

const userRoutes = require("./routes/userRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const cakeRoutes = require("./routes/cakeRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const esewaRoutes = require("./routes/esewaRoutes");
const addressRoutes = require("./routes/addressRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const rewardsRoutes = require("./routes/rewardsRoutes");
const promotionRoutes = require("./routes/promotionRoutes");
const contactRoutes = require("./routes/contactRoutes");

const { errorHandler, notFound } = require("./middleware/errorMiddleware");
const { apiLimiter } = require("./middleware/rateLimitMiddleware");
const requestLogger = require("./middleware/requestLogger");

const isProd = process.env.NODE_ENV === "production";

const app = express();

// Required for express-rate-limit and req.ip to see the real client address
// when running behind a reverse proxy (nginx, Render, Railway, Heroku...).
// 1 = trust one hop. Do not use `true` - it lets a client spoof
// X-Forwarded-For and walk straight around the rate limiter.
app.set("trust proxy", 1);

// Request logging first, so even requests rejected by later middleware
// (CORS, rate limit, body size) still get a log line with a request id.
app.use(requestLogger);

// Security headers (CSP, HSTS, X-Frame-Options, nosniff, ...).
app.use(helmet());

app.use(compression());

// ---------------------------------------------------------------------------
// CORS
//
// The previous policy allowed any origin containing "ngrok" and, when
// NODE_ENV was anything other than "production", every origin on the internet.
// The allowlist is now explicit, and the permissive development branch cannot
// leak into a deployment where NODE_ENV is simply unset.
// ---------------------------------------------------------------------------
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(isProd
    ? []
    : [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
      ]),
  // Comma-separated extra origins, e.g. a staging domain or an ngrok tunnel.
  ...(process.env.CORS_EXTRA_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
].filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Same-origin and non-browser clients (curl, Postman, server-to-server)
    // send no Origin header. CORS is a browser policy, so there is nothing to
    // enforce for these.
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Explicit body size caps. The default is 100kb; being explicit means the
// limit is a decision rather than an accident.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Broad abuse ceiling. Per-endpoint limiters (login, password reset, contact)
// are applied inside their own route files.
app.use("/api", apiLimiter);

// ---------------------------------------------------------------------------
// Health checks
//  /health - is the process alive?      (liveness)
//  /ready  - can it actually serve?     (readiness - checks the database)
// ---------------------------------------------------------------------------
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.get("/ready", (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ready" : "not ready",
    database: dbConnected ? "connected" : "disconnected",
  });
});

app.get("/", (req, res) => {
  res.send("API Running...");
});

// Routes
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cakes", cakeRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/esewa", esewaRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/rewards", rewardsRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/contact", contactRoutes);

// notFound: catches any request to a route that does not exist.
// errorHandler: handles errors thrown anywhere in the stack above.
app.use(notFound);
app.use(errorHandler);

module.exports = app;

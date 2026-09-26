/**
 * Error tracking.
 *
 * Logs tell you what happened if you go looking. Error tracking comes and
 * finds you: it groups identical stack traces, counts how many users each one
 * hit, and alerts when something new starts failing. The gap between
 * "a customer emailed us three days later" and "we knew in 30 seconds" is
 * this.
 *
 * Entirely opt-in. With no SENTRY_DSN set, every function here is a no-op and
 * the SDK is never initialised - so the app runs identically without an
 * account, and nothing is sent anywhere from a developer machine.
 *
 * To turn it on: create a free project at sentry.io, copy the DSN into
 * SENTRY_DSN, and redeploy. Nothing else changes.
 */

const Sentry = require("@sentry/node");

const dsn = process.env.SENTRY_DSN;
const enabled = Boolean(dsn);

/**
 * Must be called before requiring the Express app, so the SDK can patch the
 * modules it instruments.
 */
const initSentry = () => {
  if (!enabled) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    // Ties an error to the exact deploy that caused it. Wire this to the
    // commit SHA in CI (GITHUB_SHA) to get that for free.
    release: process.env.SENTRY_RELEASE,

    // Fraction of requests traced for performance monitoring. 10% is plenty
    // to spot a slow endpoint without burning the free tier's quota.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    // Do not ship request bodies or headers by default. They contain
    // passwords, tokens and addresses, and an error tracker is a third party.
    sendDefaultPii: false,

    beforeSend(event) {
      // Belt and braces on top of sendDefaultPii: strip anything that could
      // carry a credential before the event leaves the process.
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });

  return true;
};

/**
 * Report an error explicitly. Safe to call whether or not Sentry is enabled.
 *
 * Use this for failures you catch and handle but still want visibility on -
 * a payment that could not be verified, an email that would not send. Those
 * never reach the Express error handler, so they would otherwise be invisible.
 */
const captureError = (error, context = {}) => {
  if (!enabled) return;
  Sentry.captureException(error, { extra: context });
};

module.exports = {
  Sentry,
  initSentry,
  captureError,
  isSentryEnabled: () => enabled,
};

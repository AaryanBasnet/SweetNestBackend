# syntax=docker/dockerfile:1

# =============================================================================
# SweetNest API
#
# Multi-stage build. The "deps" stage installs dependencies; the final stage
# copies only what is needed to run. This matters for two reasons:
#
#   1. Size - build tooling and dev dependencies never reach the shipped image.
#   2. Caching - dependencies are installed in their own layer keyed on
#      package-lock.json, so editing a controller does not trigger a reinstall.
#      Copying the whole source before npm ci would invalidate that cache on
#      every single code change.
# =============================================================================

# Pinned to a minor version, not just "22" or "latest": a reproducible build is
# one where the same commit produces the same image next month.
ARG NODE_VERSION=22.14-alpine


# --- Dependencies ------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

COPY package.json package-lock.json ./

# npm ci installs exactly what the lockfile pins and fails if package.json and
# the lockfile disagree. --omit=dev leaves out jest, eslint and friends.
RUN npm ci --omit=dev && npm cache clean --force


# --- Runtime -----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

# dumb-init becomes PID 1 and forwards signals properly. Without it Node runs
# as PID 1, where it does not get default signal handlers - so `docker stop`
# would be ignored until the 10s timeout and then SIGKILL, cutting off the
# graceful shutdown in server.js mid-request.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV PORT=5000

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# `node` is an unprivileged user that the official image already provides.
# Running as root inside a container means a container escape starts with root
# on the host - there is no reason to accept that risk for a web API.
COPY --chown=node:node . .

USER node

EXPOSE 5000

# Uses the readiness endpoint, which actually checks the database - not just
# whether the process is alive. Compose and orchestrators use this to decide
# when the service is ready to receive traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

# syntax=docker/dockerfile:1

# =============================================================================
# SweetNest API
#
# One Dockerfile, three stages. Build whichever you need with --target:
#
#   docker build .                  the production image (the last stage, "runtime")
#   docker build --target dev .     the development image (hot reload, all dev tools)
#
# Why stages: each stage starts from a fresh base image, and only what is copied
# between stages is kept. Build tools and dev dependencies never reach the image
# that runs in production, which makes it smaller and gives an attacker less to
# work with.
#
# Why the Node version is written out in each FROM line, and not in a variable:
# Dependabot reads FROM lines to propose base-image updates. A version hidden in
# an ARG is invisible to it. The exact tag also means the same commit gives the
# same image next month (a floating tag such as "22" or "latest" does not).
# =============================================================================


# --- 1. Production dependencies ----------------------------------------------
FROM node:26.12.1-alpine AS deps

WORKDIR /app

# Only the two files that describe the dependencies, copied BEFORE the source.
# Docker caches each instruction as a layer and reuses it while its inputs are
# unchanged. Editing a controller does not touch package-lock.json, so the slow
# "npm ci" layer below is reused instead of reinstalling everything every time.
COPY package.json package-lock.json ./

# npm ci installs exactly what the lockfile pins and fails if package.json and
# the lockfile disagree. --omit=dev leaves out jest, eslint and friends.
# The cache mount keeps npm's download cache between builds (BuildKit feature).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev


# --- 2. Development image ----------------------------------------------------
# Used by docker-compose.dev.yml. Has the dev dependencies and runs the app with
# "node --watch", which restarts when a file changes. "docker compose watch" copies
# every file you save into the running container (see docker-compose.dev.yml).
FROM node:26.12.1-alpine AS dev

ENV NODE_ENV=development
ENV PORT=5000
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY --chown=node:node . .

USER node
EXPOSE 5000
CMD ["npm", "run", "dev"]


# --- 3. Production runtime (the default target) ------------------------------
FROM node:26.12.1-alpine AS runtime

# dumb-init becomes PID 1 and forwards signals properly. Without it Node runs
# as PID 1, where it does not get default signal handlers - so `docker stop`
# would be ignored until the 10s timeout and then SIGKILL, cutting off the
# graceful shutdown in server.js mid-request.
RUN apk add --no-cache dumb-init

# The image that RUNS the API does not need npm, yarn or corepack: dependencies were installed in the
# "deps" stage and the command is plain "node server.js". Removing them makes the image smaller and, more
# to the point, removes a pile of code nothing uses. The vulnerability scan flagged 10 HIGH findings, and
# every one was in npm's own bundled packages, not in this app.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

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

# Who built this image and from what. CI passes the commit; GitHub uses "source"
# to link the published image to this repository.
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="SweetNest API" \
      org.opencontainers.image.description="REST API for the SweetNest cake store" \
      org.opencontainers.image.source="https://github.com/AaryanBasnet/SweetNestBackend" \
      org.opencontainers.image.licenses="ISC" \
      org.opencontainers.image.revision="${GIT_SHA}"

# Uses the readiness endpoint, which actually checks the database - not just
# whether the process is alive. Compose and orchestrators use this to decide
# when the service is ready to receive traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

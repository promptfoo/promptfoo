# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# TODO(ian): Remove the SecretsUsedInArgOrEnv check once we remove the placeholder for NEXT_PUBLIC_SUPABASE_ANON_KEY

# https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

# ---- Build ----
ARG BUILDPLATFORM=linux/amd64
FROM --platform=${BUILDPLATFORM} node:20-alpine AS builder

# Set environment variables for the build
ARG NEXT_PUBLIC_PROMPTFOO_BASE_URL
ENV NEXT_PUBLIC_PROMPTFOO_BASE_URL=${NEXT_PUBLIC_PROMPTFOO_BASE_URL}
ENV NEXT_PUBLIC_PROMPTFOO_BUILD_STANDALONE_SERVER=1
ENV NEXT_TELEMETRY_DISABLED=1

# TODO(ian): Backwards compatibility, 2024-04-01
ARG NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL
ENV NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL=${NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL}

# Supabase opt-in
ARG NEXT_PUBLIC_PROMPTFOO_USE_SUPABASE
ENV NEXT_PUBLIC_PROMPTFOO_USE_SUPABASE=${NEXT_PUBLIC_PROMPTFOO_USE_SUPABASE}

# These envars are not necessarily used, but must be set to prevent the build process from erroring.
ENV NEXT_PUBLIC_SUPABASE_URL=http://placeholder.promptfoo.dev
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder

WORKDIR /app
COPY . .

# Install dependencies and build the application
RUN apk update && apk add --no-cache python3 build-base

# Envars are read in from src/web/nextui/.env.production
RUN echo "*** Building with env vars from .env.production"

RUN npm install
RUN npm run build

WORKDIR /app/src/web/nextui
RUN npm prune --omit=dev

# Final Stage
FROM node:20-alpine

# Set metadata for the image
LABEL org.opencontainers.image.source="https://github.com/promptfoo/promptfoo"
LABEL org.opencontainers.image.description="promptfoo is a tool for testing evaluating and red-teaming LLM apps."
LABEL org.opencontainers.image.licenses="MIT"

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Copy built files from the builder stage
COPY --from=builder /app/src/web/nextui/public ./public
COPY --from=builder /app/src/web/nextui/.next/standalone ./
COPY --from=builder /app/src/web/nextui/.next/static ./src/web/nextui/.next/static
COPY --from=builder /app/drizzle ./src/web/nextui/.next/server/drizzle

## build + install better-sqlite3
## This is a kludge to get better-sqlite3 to work on mac M1
## see: https://github.com/promptfoo/promptfoo/issues/1330
ARG BSQL3_VERSION=v11.1.2
RUN apk update && apk add --no-cache python3 build-base git && \
    mkdir -p /tmp/build/ && \
    cd /tmp/build/ && \
    git clone https://github.com/WiseLibs/better-sqlite3.git && \
    cd better-sqlite3 && git checkout $BSQL3_VERSION && \
    cd /app && \
    cp -r /tmp/build/better-sqlite3/* /app/node_modules/better-sqlite3/ && \
    cd node_modules/better-sqlite3 && \
    npm run build-release && \
    rm -rf /tmp/build/ && \
    apk del python3 build-base git

# Set up directories and permissions
RUN mkdir -p /root/.promptfoo/output
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
RUN mkdir -p /root/.promptfoo/output /app/src/web/nextui
RUN chown -R nextjs:nodejs /app /root/.promptfoo /app/src/web/nextui

# Install Python, pip, and other necessary packages
RUN apk add --no-cache python3 py3-pip curl sqlite-dev && \
    python3 -m ensurepip && \
    pip3 install --no-cache --upgrade pip setuptools && \
    ln -sf python3 /usr/bin/python

# Create entrypoint script
RUN echo -e '#!/bin/sh\n\
    echo "Writing environment variables to .env file..."\n\
    env > /app/src/web/nextui/.env\n\
    echo "Loaded environment variables:"\n\
    cat /app/src/web/nextui/.env\n\
    echo "Starting server..."\n\
    node src/web/nextui/server.js' > entrypoint.sh
RUN chmod +x entrypoint.sh

# Switch to non-root user
USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Set up healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s CMD curl -f http://$HOSTNAME:$PORT || exit 1

CMD ["sh", "entrypoint.sh"]

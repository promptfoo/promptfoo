# syntax=docker/dockerfile:1
FROM --platform=${BUILDPLATFORM} ubuntu:24.04 AS node-installer

# Install Node.js on Ubuntu 24.04
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

FROM ubuntu:24.04 AS base

# Install Node.js
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd -r promptfoo && useradd -r -g promptfoo promptfoo

# Install Python 3.12 for python providers, prompts, asserts, etc.
# Ubuntu 24.04 comes with Python 3.12
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3.12 \
    python3-pip \
    python3-setuptools \
    curl && \
    ln -sf python3.12 /usr/bin/python3 && \
    ln -sf python3 /usr/bin/python && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies only when needed
FROM base AS builder
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ARG VITE_PUBLIC_BASENAME
ARG PROMPTFOO_REMOTE_API_BASE_URL
ARG TARGETARCH

# Set environment variables for the build
ENV VITE_IS_HOSTED=1 \
    VITE_TELEMETRY_DISABLED=1 \
    VITE_PUBLIC_BASENAME=${VITE_PUBLIC_BASENAME} \
    PROMPTFOO_REMOTE_API_BASE_URL=${PROMPTFOO_REMOTE_API_BASE_URL}

# Install dependencies (deterministic + cached)
COPY package.json package-lock.json ./
# Leverage BuildKit cache and install architecture-specific binaries
RUN npm ci --install-links --include=peer

# Copy the rest of the application code
COPY . .

WORKDIR /app/packages/toolkit
RUN npm install

# Run npm install for the react app
WORKDIR /app/src/app
RUN npm install

WORKDIR /app

RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

FROM base AS server
WORKDIR /app
COPY --from=builder --chown=promptfoo:promptfoo /app/node_modules ./node_modules
COPY --from=builder --chown=promptfoo:promptfoo /app/dist ./dist

RUN npm link promptfoo && \
    chown promptfoo:promptfoo /app/node_modules/promptfoo && \
    mkdir -p /home/promptfoo/.promptfoo && chown promptfoo:promptfoo /home/promptfoo/.promptfoo

ENV API_PORT=3000
ENV HOST=0.0.0.0
ENV PROMPTFOO_SELF_HOSTED=1

USER promptfoo

EXPOSE 3000

# Set up healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/src/server/index.js"]

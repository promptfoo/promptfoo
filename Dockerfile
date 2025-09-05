# syntax=docker/dockerfile:1
FROM --platform=${BUILDPLATFORM} node:22.14.0-alpine

FROM node:22.14.0-alpine AS base

RUN addgroup -S promptfoo && adduser -S promptfoo -G promptfoo
# Make Python version configurable with a default of 3.12
ARG PYTHON_VERSION=3.12

# Install Python for python providers, prompts, asserts, etc.
RUN apk add --no-cache python3~=${PYTHON_VERSION} py3-pip py3-setuptools curl && \
    ln -sf python3 /usr/bin/python

# Install dependencies only when needed
FROM base AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

ARG VITE_PUBLIC_BASENAME
ARG PROMPTFOO_REMOTE_API_BASE_URL

# Set environment variables for the build
ENV VITE_IS_HOSTED=1 \
    VITE_TELEMETRY_DISABLED=1 \
    VITE_PUBLIC_BASENAME=${VITE_PUBLIC_BASENAME} \
    PROMPTFOO_REMOTE_API_BASE_URL=${PROMPTFOO_REMOTE_API_BASE_URL}

# Install dependencies (deterministic + cached)
COPY package.json package-lock.json ./
# Leverage BuildKit cache
RUN --mount=type=cache,target=/root/.npm \
    npm ci --install-links --include=peer

# Copy the rest of the application code
COPY . .

# Run npm install for the react app
WORKDIR /app/src/app
RUN npm install

WORKDIR /app
RUN npm run build

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

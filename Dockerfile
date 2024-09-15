FROM --platform=${BUILDPLATFORM} node:20-alpine

FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Set environment variables for the build
ENV NEXT_PUBLIC_HOSTED=1
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

RUN npm install --install-links --include=peer
RUN mkdir -p src/web/nextui/out
RUN npm run build

FROM base AS server

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Install Python for python providers, prompts, asserts, etc.
RUN apk add --no-cache python3 py3-pip py3-setuptools
RUN ln -sf python3 /usr/bin/python

ENV API_PORT=3000

EXPOSE 3000

CMD ["node", "dist/src/server/index.js"]

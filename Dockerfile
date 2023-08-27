# https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

# ---- Build ----
FROM node:16-alpine AS builder
ENV PROMPTFOO_BUILD_STANDALONE_SERVER=1

WORKDIR /app
COPY . .

# Note envars are read in from src/web/nextui/.env.production
RUN echo "Building with env vars (.env.production):"
RUN cat src/web/nextui/.env.production

RUN npm install

WORKDIR /app/src/web/nextui
RUN npm prune --production

# ---- Final Stage ----
FROM node:16-alpine

WORKDIR /app

COPY --from=builder /app/src/web/nextui/public ./public
COPY --from=builder /app/src/web/nextui/.next/standalone ./
COPY --from=builder /app/src/web/nextui/.next/static ./.next/static

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]

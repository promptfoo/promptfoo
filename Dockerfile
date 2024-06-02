# https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

# ---- Build ----
FROM node:18-alpine AS builder

ARG NEXT_PUBLIC_PROMPTFOO_BASE_URL
ENV NEXT_PUBLIC_PROMPTFOO_BASE_URL=${NEXT_PUBLIC_PROMPTFOO_BASE_URL}
ENV NEXT_PUBLIC_PROMPTFOO_BUILD_STANDALONE_SERVER=1
ENV NEXT_TELEMETRY_DISABLED 1

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

# Necessary for node-gyp deps
RUN apk update && apk add python3 build-base --no-cache

# Envars are read in from src/web/nextui/.env.production
RUN echo "*** Building with env vars from .env.production"

RUN npm install
RUN npm run build

WORKDIR /app/src/web/nextui
RUN npm prune --production

# ---- Final Stage ----
FROM node:18-alpine

ENV NEXT_TELEMETRY_DISABLED 1

WORKDIR /app

COPY --from=builder /app/src/web/nextui/public ./public
COPY --from=builder /app/src/web/nextui/.next/standalone ./
COPY --from=builder /app/src/web/nextui/.next/static ./.next/static
COPY --from=builder /app/drizzle ./.next/server/drizzle

RUN mkdir -p /root/.promptfoo/output

# Create a script to write environment variables to .env file
RUN echo -e '#!/bin/sh\n\
echo "Writing environment variables to .env file..."\n\
env > .env\n\
echo "Loaded environment variables:"\n\
cat .env\n\
echo "Starting server..."\n\
node src/web/nextui/server.js' > entrypoint.sh

# Make the script executable
RUN chmod +x entrypoint.sh

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["sh", "entrypoint.sh"]

FROM node:20-alpine AS builder
WORKDIR /api

COPY . ./

RUN npm install
RUN npm run build:server

FROM node:20-alpine AS runner
WORKDIR /api

COPY --from=builder /api/dist/server ./
COPY --from=builder /api/node_modules ./node_modules
COPY --from=builder /api/drizzle ./drizzle

EXPOSE 15500

ENV PORT=15500
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD curl -f http://$HOSTNAME:$PORT/api/health || exit 1

CMD ["node", "src/web/execServer.js"]
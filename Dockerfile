# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

ARG DATABASE_URL=mongodb://localhost:27017/order-service
ENV DATABASE_URL=$DATABASE_URL

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run prisma:generate
RUN npm run build

# ─── Stage 2: Production deps ────────────────────────────────────────────────
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# ─── Stage 3: Runner ─────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 app

WORKDIR /app

ARG ENV=production
ARG APP_VERSION=unknown
ENV ENV=$ENV \
    APP_VERSION=$APP_VERSION \
    NODE_ENV=$ENV

# Production node_modules
COPY --from=deps    --chown=app:nodejs /app/node_modules                ./node_modules
COPY --from=builder --chown=app:nodejs /app/node_modules/.prisma         ./node_modules/.prisma

# Schema — required by migrate deploy
COPY --from=builder --chown=app:nodejs /app/prisma                      ./prisma

# App
COPY --from=builder --chown=app:nodejs /app/dist                        ./dist
COPY --from=builder --chown=app:nodejs /app/package.json                ./package.json

COPY --chown=app:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER app
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]

# One image per app, always built from the repo root: docker build --target api|web .
# turbo prune keeps only the app's workspace slice so lockfile installs stay small and cacheable.

FROM node:22-alpine AS base
RUN npm install -g pnpm@12.23.0 turbo@2.11.13
WORKDIR /repo

FROM base AS pruner
ARG APP
COPY . .
RUN turbo prune ${APP} --docker

FROM base AS builder
ARG APP
# Baked into the Next.js rewrite at build time; unused by the api build.
ARG API_URL=http://api:4000
ENV API_URL=${API_URL}
ENV NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN turbo run build --filter=${APP}

# ---- api ----
FROM base AS api-deps
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile --prod --filter api

FROM node:22-alpine AS api
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=api-deps /repo/node_modules ./node_modules
COPY --from=api-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /repo/apps/api/package.json ./apps/api/package.json
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/main.mjs"]

# ---- web ----
FROM node:22-alpine AS web
WORKDIR /repo
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

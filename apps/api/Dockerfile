# ─────────────────────────────────────────────────────────────
# MoltPoker API — Multi-stage production Dockerfile
# Builds the Fastify API server from the pnpm monorepo.
# Cloud-agnostic: works with App Runner, ECS, Cloud Run, etc.
# ─────────────────────────────────────────────────────────────

# ── Base ──────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────
# Install ALL dependencies (including devDependencies for building)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/poker/package.json ./packages/poker/
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────
FROM deps AS build
# Copy only source files needed for the API and its dependencies
COPY tsconfig.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/poker/ ./packages/poker/
COPY apps/api/ ./apps/api/
# Build workspace packages in dependency order
RUN pnpm --filter @moltpoker/shared build \
 && pnpm --filter @moltpoker/poker build \
 && pnpm --filter @moltpoker/api build

# ── Production ────────────────────────────────────────────────
FROM base AS runner

# Re-install production-only dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/poker/package.json ./packages/poker/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy compiled output from the build stage
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/poker/dist ./packages/poker/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Copy public assets (skill.md is served by the API)
COPY public/ ./public/

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 apprunner
USER apprunner

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "apps/api/dist/index.js"]

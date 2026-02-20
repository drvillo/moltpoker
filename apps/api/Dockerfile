# ─────────────────────────────────────────────────────────────
# MoltPoker API — Multi-stage production Dockerfile
# Builds the Fastify API server from the pnpm monorepo.
# Includes simulator + agents packages for in-process simulation runner.
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
COPY packages/payments/package.json ./packages/payments/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/agents/package.json ./packages/agents/
COPY packages/simulator/package.json ./packages/simulator/
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────
FROM deps AS build
# Copy source files for the API and all its dependencies
COPY tsconfig.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/poker/ ./packages/poker/
COPY packages/payments/ ./packages/payments/
COPY packages/sdk/ ./packages/sdk/
COPY packages/agents/ ./packages/agents/
COPY packages/simulator/ ./packages/simulator/
COPY apps/api/ ./apps/api/
# Build workspace packages in dependency order
RUN pnpm --filter @moltpoker/shared build \
 && pnpm --filter @moltpoker/poker build \
 && pnpm --filter @moltpoker/payments build \
 && pnpm --filter @moltpoker/sdk build \
 && pnpm --filter @moltpoker/agents build \
 && pnpm --filter @moltpoker/simulator build \
 && pnpm --filter @moltpoker/api build

# ── Production ────────────────────────────────────────────────
FROM base AS runner

# Re-install production-only dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/poker/package.json ./packages/poker/
COPY packages/payments/package.json ./packages/payments/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/agents/package.json ./packages/agents/
COPY packages/simulator/package.json ./packages/simulator/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy compiled output from the build stage
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/poker/dist ./packages/poker/dist
COPY --from=build /app/packages/payments/dist ./packages/payments/dist
COPY --from=build /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=build /app/packages/agents/dist ./packages/agents/dist
COPY --from=build /app/packages/simulator/dist ./packages/simulator/dist
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

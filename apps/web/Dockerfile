# ─────────────────────────────────────────────────────────────
# MoltPoker Web App — Multi-stage production Dockerfile
# Builds the Next.js web frontend from the pnpm monorepo.
# ─────────────────────────────────────────────────────────────

# ── Base ──────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────
FROM deps AS build
# Accept build-time environment variables
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

COPY tsconfig.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/
# Build shared package first, then web app
RUN pnpm --filter @moltpoker/shared build \
 && pnpm --filter @moltpoker/web build

# ── Production ────────────────────────────────────────────────
FROM base AS runner

# Re-install production-only dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy compiled output from build stage
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/next.config.js ./apps/web/
COPY --from=build /app/apps/web/package.json ./apps/web/

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
USER nextjs

WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

CMD ["pnpm", "start"]

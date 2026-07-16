# syntax=docker/dockerfile:1.7

# ---- deps: install once, reused by every later stage ----------------------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- tools: full toolchain, no build — target for the `migrator` service --
# Used to run `prisma migrate deploy` / `db seed` / `admin:ensure` as one-off
# `docker compose run` invocations. Deliberately does NOT run `next build`
# (which needs a reachable, already-migrated database — see the postgres
# service's port-binding comment in docker-compose.yml), so this image can
# always be built regardless of database state, breaking what would
# otherwise be a circular dependency between "build the migrator" and "run
# migrations before the app can build."
FROM node:22-slim AS tools
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate

# ---- builder: production Next.js build (needs DB access — see below) ------
FROM tools AS builder
# NEXT_PUBLIC_* vars are inlined into client bundles at build time by
# Next.js, not read at runtime — they must arrive as build ARGs (they're
# public by definition, safe as plain args, unlike DATABASE_URL below).
# Without these, Meta Pixel and the Koko promo surfaces would silently
# never activate even with the vars correctly set in .env at runtime.
ARG NEXT_PUBLIC_META_PIXEL_ID
ARG NEXT_PUBLIC_KOKO_ENABLED
ARG NEXT_PUBLIC_DEBUG_CART
ENV NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID
ENV NEXT_PUBLIC_KOKO_ENABLED=$NEXT_PUBLIC_KOKO_ENABLED
ENV NEXT_PUBLIC_DEBUG_CART=$NEXT_PUBLIC_DEBUG_CART
# Several storefront pages use ISR (`export const revalidate = N`), which
# makes `next build` query the database at build time to prerender them.
# DATABASE_URL is passed as a BuildKit secret (never a build ARG) so the
# connection string never lands in an image layer or `docker history`.
# The docker-compose.yml `app` service's build config supplies this secret
# and sets `network: host` so this step can reach Postgres at 127.0.0.1:5432
# (see the postgres service's port-binding comment for why).
RUN --mount=type=secret,id=database_url \
    DATABASE_URL="$(cat /run/secrets/database_url)" npm run build

# ---- runner: lean production server ----------------------------------------
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Next's standalone file tracer (@vercel/nft) resolves Prisma's native query
# engine binary at runtime, not via static `require()`, so it's unreliable
# about including node_modules/.prisma in the traced output. Copy it
# explicitly — without this, the app boots but every DB query fails,
# /api/health returns 500, the container never reports healthy, and (since
# nginx depends_on app: condition: service_healthy) the whole stack never
# comes up.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma

# Persistent upload target — a named volume is mounted here at runtime
# (docker-compose.yml `uploads` volume). Pre-create it with correct
# ownership so the non-root `node` user can write to it even before the
# volume is populated.
RUN mkdir -p /app/public/uploads && chown -R node:node /app/public/uploads

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{process.exit(r.status===200?0:1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

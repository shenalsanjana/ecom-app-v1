# Decouple DB Migration from the Vercel Build

**Date:** 2026-06-04
**Status:** Approved design

## Problem

Every Vercel deploy runs database work *before* compiling the app. From `vercel.json`:

```
prisma generate
  && (prisma migrate resolve --applied 20260527000000_add_user_role || true)
  && prisma migrate deploy
  && tsx prisma/seed.ts
  && tsx scripts/ensure-admin.ts
  && next build
```

When the Prisma Postgres instance (`db.prisma.io:5432`) is unreachable — it is a tier that **pauses on inactivity** — the build aborts at `prisma migrate deploy` with `P1001 Can't reach database server`, and `next build` never runs. A deploy that changes only frontend code (e.g. a CSS tweak) fails for a reason unrelated to the code.

Two distinct problems:
1. **Deployability is coupled to DB availability** at the migrate step.
2. **Production is re-seeded on every deploy** (`prisma/seed.ts` runs each time), which is redundant (Postgres persists the catalog) and risky.

## Goal

Pull all DB-touching steps out of the per-deploy build command so the **build no longer fails at the migrate/seed step**, and give migrations a deliberate home that preserves migrate-before-deploy ordering as well as is practical without new infrastructure beyond a single workflow.

## Non-goals (explicitly out of scope)

- **Making `next build` itself DB-independent.** The root layout (`app/layout.tsx`) awaits `getDeliveryConfig()` → `prisma.storeSettings.findUnique(...)`, and ISR catalog pages (`categories`, `products/[id]`, `deals`) pre-render at build. So `next build` still queries the DB during static generation. Decoupling the migrate step does **not** change that, and we are not changing the rendering strategy here. This is acceptable: the live app needs the DB regardless, so the real guarantee against outages is keeping the DB reachable.
- **Strict migrate-before-build ordering** via a Vercel Deploy Hook + disabled auto-deploy. Noted as a future option below.

## Design

### 1. Slim the build command (`vercel.json`)

```
prisma generate && next build
```

`prisma generate` stays — it only generates the Prisma Client from the schema and needs no DB connection. All DB-touching steps are removed.

### 2. Migrations move to a GitHub Action (`.github/workflows/migrate.yml`)

Trigger: `push` to `main`. Steps:
- `actions/checkout`
- `actions/setup-node` with Node 20, `cache: npm`
- `npm ci`
- `npx prisma migrate resolve --applied 20260527000000_add_user_role || true` — preserved verbatim from the old build command (a one-time baseline-drift fix). Commented as removable once confirmed unnecessary.
- `npx prisma migrate deploy`

Environment: `DATABASE_URL` injected from a **GitHub repository secret** (`secrets.DATABASE_URL`). `concurrency` group on `main` so overlapping pushes don't run migrations simultaneously.

This keeps migrations automatic on merge to `main`, preserving "migrations get applied when main changes" without embedding them in the Vercel build.

### 3. Seed and ensure-admin become deliberate manual commands

They are removed from the deploy path entirely. The production DB already holds the catalog (Postgres persists between deploys), so per-deploy seeding was redundant.

- Keep existing `npm run db:seed` (`prisma db seed`) and `npm run admin:ensure` (`tsx scripts/ensure-admin.ts`) for occasional manual use.
- Add `db:deploy` script: `"db:deploy": "prisma migrate deploy"` — a manual fallback / local-against-prod escape hatch matching what the Action runs.

### 4. Secret management + credential rotation

The Action requires `DATABASE_URL` as a GitHub Actions secret. This is the moment to action the **pending Prisma credential rotation**: rotate the DB credential, store the fresh URL as `secrets.DATABASE_URL` in GitHub, and update Vercel's `DATABASE_URL` env var. Do not place the URL in `vercel.json` or any committed file.

> This is an **operator action**, not code. The plan will list it as a manual checklist item; the workflow file references `secrets.DATABASE_URL` and is inert until the secret exists.

### 5. Documentation

Update `README.md` (and/or `docs/`) to describe the new flow:
- Migrations apply automatically via the `migrate.yml` Action on push to `main`.
- Seeding and admin-ensure are manual: `npm run db:seed`, `npm run admin:ensure`.
- The `DATABASE_URL` GitHub secret is required for migrations to run.

## Known limitation (documented, accepted)

The Action runs migrations **in parallel** with Vercel's build, not strictly before it. For this app the race is low-risk because build-time rendering is read-only. Strict ordering would require a Vercel Deploy Hook triggered by the Action with auto-deploy disabled — deferred as a future enhancement.

## Components & boundaries

- `vercel.json` — owns *how the app is built* (now: generate client + compile). No DB concerns.
- `.github/workflows/migrate.yml` — owns *applying schema migrations* on main. Single responsibility.
- `package.json` scripts — owns *manual DB operations* (seed, ensure-admin, deploy).
- Each is independent: changing the build command does not touch migrations; the Action does not know about Vercel.

## Testing / Verification

Infra changes cannot be fully exercised locally (the build still needs the DB for SSG; the Action only runs on push). Verification is:
1. `vercel.json` is valid JSON and `buildCommand` is exactly `prisma generate && next build`.
2. `.github/workflows/migrate.yml` is valid YAML (lint / `actionlint` if available) and references `secrets.DATABASE_URL`.
3. `package.json` parses and contains the new `db:deploy` script.
4. First real push to `main` (after the secret is set): the **migrate** Action runs `prisma migrate deploy` successfully, and the Vercel build runs `prisma generate && next build` without the migrate/seed steps.

## Validation

`npm run build` must still pass before merge where a DB is reachable (per `CLAUDE.md`). Note this is unchanged by this work — the build's DB dependency for SSG remains.

# Netlify Deployment + Custom Domain — Design

**Date:** 2026-05-04
**Sub-project:** Production hosting on Netlify with `dressingbear.com`
**Status:** Approved

## Goal

Take the current Next.js 16 e-commerce app from a SQLite-on-localhost dev setup to a production deployment on Netlify, served at `https://dressingbear.com` (Namecheap-registered, Netlify-DNS-delegated). All writes (orders, accounts, wishlist) must persist across deploys.

## Non-goals

- Payment gateway integration (no Stripe/PayHere in scope here)
- Analytics or error tracking (Sentry, etc.)
- Image CDN beyond Netlify's built-in optimization
- Admin UI for product management
- Variants/inventory schema work (covered by separate sub-project per stabilization design)

## Baseline (verified 2026-05-04)

- Branch: `develop`. Production branch will be `main`.
- Git remote already set: `https://github.com/shenalsanjana/ecom-app-v1.git`
- Stack: Next.js 16.2.4, React 19, Prisma 6, NextAuth v5 beta, Nodemailer, **SQLite** (`file:./dev.db`)
- `@netlify/plugin-nextjs` v5.15.10 already in `package.json`
- No `netlify.toml` yet
- DNS already delegated to Netlify; `dressingbear.com` and `www.dressingbear.com` already resolve to site `courageous-hamster-b8bf85.netlify.app`
- Netlify site already linked to the GitHub repo (per user)

## Architecture decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | **Turso (libSQL)** with Prisma libSQL driver adapter | Wire-compatible with SQLite; zero schema rewrite; existing migrations apply as-is |
| Production branch | `main` | Buffer between active work (`develop`) and prod; PRs `develop → main` get deploy previews |
| DNS | **Netlify DNS** (already done) | Apex + www handled by NETLIFY/NETLIFYv6 record types; auto SSL |
| SMTP | **Brevo** (`smtp-relay.brevo.com:587`) | Free tier sufficient; user has existing account |
| Preview DB | **Separate Turso DB** from production | A buggy preview cannot corrupt prod data |
| Preview email | **Disabled** (empty SMTP env in preview scope) | Cannot accidentally email customers from a PR |
| Seed strategy | Run on every build, but **gated by empty-DB check** in `seed.ts` | Idempotent first deploy; safe re-runs; explicit `FORCE_SEED=true` env var for opt-in reseed |

## Scope

### 1. Database migration: SQLite → Turso

**Code changes:**

- Add deps: `@libsql/client`, `@prisma/adapter-libsql`
- `prisma/schema.prisma` — enable driver adapters in client generator:
  ```prisma
  generator client {
    provider        = "prisma-client-js"
    previewFeatures = ["driverAdapters"]
  }
  ```
  Datasource stays `provider = "sqlite"` — libSQL is wire-compatible. Existing migrations in `prisma/migrations/` apply unchanged.
- `app/_lib/prisma.ts` — switch the singleton: when `TURSO_DATABASE_URL` is present, instantiate `PrismaClient` with `PrismaLibSQL` adapter using `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`. Otherwise (local dev) keep the current behavior driven by `DATABASE_URL=file:./dev.db`.

**Seed guard:**

- Add an early-return at the top of `prisma/seed.ts`: if `await prisma.category.count() > 0` and `process.env.FORCE_SEED !== "true"`, log "DB already seeded, skipping" and exit 0.
- Keeps first-deploy seeding automatic; prevents destructive `deleteMany` on reviews/images on every redeploy.

**Provisioning (manual, one-time, by user):**

- Create Turso DBs `dressingbear-prod` and `dressingbear-preview`
- Capture URLs and read+write auth tokens
- Tokens go directly into Netlify env-var dashboard. Never the chat, never a committed file.

### 2. Netlify build configuration

**New file: `netlify.toml`**

```toml
[build]
  command = "prisma generate && prisma migrate deploy && tsx prisma/seed.ts && next build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "20"
  PRISMA_SKIP_POSTINSTALL_GENERATE = "1"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

**Build pipeline order:**

1. `prisma generate` — generate the client with libSQL adapter wiring
2. `prisma migrate deploy` — apply any pending migrations to Turso (idempotent)
3. `tsx prisma/seed.ts` — populates products/categories on empty DB; skips otherwise (per seed guard)
4. `next build` — Next 16 build; `@netlify/plugin-nextjs` routes SSR/middleware/ISR to Functions

If migrate fails, the deploy aborts before building.

**Netlify dashboard actions (user, one-time):**

- Site settings → Build & deploy → set **production branch = `main`**
- Configure environment variables per §3 below

### 3. Environment variables

Set in Netlify → Site settings → Environment variables. Each row's "Scope" column controls which deploy contexts the variable applies to.

| Variable | Scope | Notes |
|---|---|---|
| `TURSO_DATABASE_URL` | Production | `libsql://dressingbear-prod-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | Production | From Turso dashboard |
| `TURSO_DATABASE_URL` | Deploy previews | `libsql://dressingbear-preview-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | Deploy previews | Separate token for preview DB |
| `AUTH_SECRET` | All scopes | Generate fresh with `openssl rand -base64 32`. **Different value per scope ideally.** Never reuse the dev value. |
| `AUTH_URL` | Production | `https://dressingbear.com` |
| `APP_URL` | Production | `https://dressingbear.com` |
| `NEXTAUTH_URL` | Production | Mirror of `AUTH_URL` (NextAuth v5 still reads as fallback) |
| `SMTP_HOST` | Production | `smtp-relay.brevo.com` |
| `SMTP_PORT` | Production | `587` |
| `SMTP_USER` | Production | Brevo SMTP login (form: `xxx@smtp-brevo.com`) |
| `SMTP_PASS` | Production | Brevo SMTP key. Set in Netlify UI only — never in chat or repo. |
| `SMTP_FROM` | Production | `Dressing Bear <no-reply@dressingbear.com>` |
| SMTP_* | Deploy previews | **Leave empty/unset** so previews cannot email customers |
| `BRAND_NAME` | All | `Dressing Bear` |
| `BRAND_EMAIL` | All | `dressingbear@gmail.com` |
| `CONTACT_NUMBER` | All | `+94 740545536` |
| `ROYAL_EXPRESS_ENABLED` | Production | `false` until courier API tested end-to-end |
| `ROYAL_EXPRESS_API` | Production | (existing URL) |
| `ROYAL_EXPRESS_USER` | Production | (real creds) |
| `ROYAL_EXPRESS_PASS` | Production | (real creds) |
| `FORCE_SEED` | (do not set) | Only set temporarily when an opt-in reseed is wanted; unset after the deploy |

**Secret hygiene:** all credential-bearing variables (`TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `SMTP_PASS`, `ROYAL_EXPRESS_PASS`) are entered directly into the Netlify dashboard and into local `.env.local`. They never appear in the repo, in `netlify.toml`, in chat, or in this design doc.

### 4. Auth and security

**Code changes:**

- Verify NextAuth v5 config has `trustHost: true` (so it accepts the forwarded host header on Netlify and on preview URLs). Add it if missing.
- No change needed for secure cookies — NextAuth flips them on automatically when `AUTH_URL` is `https://`.

**Already-OK items (no change):**

- `next.config.ts` — `dangerouslyAllowSVG: true` is paired with a strict CSP (`script-src 'none'; sandbox`); SVGs are author-controlled in `/public/products/`. Safe.
- `bcryptjs` for password hashes.
- Prisma uses parameterized queries by default.

### 5. Email domain authentication (Brevo)

User adds `dressingbear.com` as a sender domain in Brevo (Senders & IPs → Domains). Brevo issues records to add at Netlify DNS:

- 1× **SPF** TXT record
- 2× **DKIM** CNAME records (`brevo1._domainkey`, `brevo2._domainkey` style)
- 1× **DMARC** TXT record — start `v=DMARC1; p=none; rua=mailto:dressingbear@gmail.com` to monitor before tightening to `quarantine` or `reject`

Without these, Brevo refuses to send `from no-reply@dressingbear.com` or mail lands in spam.

### 6. Cutover sequence (one-time)

1. Provision Turso `dressingbear-prod` and `dressingbear-preview` DBs; capture URLs and tokens.
2. Add all environment variables per §3 in Netlify (production + preview scopes split as designed).
3. Generate `AUTH_SECRET` with `openssl rand -base64 32`; paste into Netlify (do not put in chat or repo).
4. Verify `dressingbear.com` in Brevo; add SPF/DKIM/DMARC records via Netlify DNS; wait for Brevo to confirm verification.
5. In Netlify → Build & deploy → set production branch = `main`.
6. Push code changes (Prisma adapter, seed guard, `netlify.toml`) to `develop`; open PR `develop → main`; smoke-test the deploy preview.
7. Merge PR. First `main` build runs: generate → migrate deploy → seed (DB empty, populates) → next build.
8. Site live at `https://dressingbear.com` with auto-provisioned Let's Encrypt cert via Netlify.

### 7. Pre-launch smoke tests (against deploy preview)

- [ ] Homepage loads, products render, images visible
- [ ] Sign up + sign in flow (creates user in preview Turso DB)
- [ ] Add-to-cart → checkout flow completes (RoyalExpress disabled)
- [ ] Wishlist, orders list, account pages load for signed-in user
- [ ] 404 page renders on bogus URL
- [ ] Reset-password page handles missing token (regression check on commit `c1bbfe3`)
- [ ] Search, category, deals pages load with skeletons (regression check on commit `b673d91`)
- [ ] Error boundaries trigger correctly on a forced error (regression check on commit `cb3bbc9`)

### 8. Post-launch verification (against `dressingbear.com`)

- [ ] DNS resolves: `dig dressingbear.com` returns Netlify's load-balancer IPs
- [ ] HTTPS cert valid; no mixed-content warnings in browser console
- [ ] One real password-reset email lands in inbox (not spam) — confirms Brevo + DKIM live
- [ ] Place a test order with `ROYAL_EXPRESS_ENABLED=false`; confirm row in Turso `Order` table
- [ ] Sign in / sign out persists across reload (cookies + secure cookies working)

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Prisma libSQL adapter is "preview features" | Stable in production use; documented Turso path. If issues arise, fall back to direct libSQL HTTP without adapter (compat shim). |
| Concurrent `migrate deploy` from racing builds | Turso accepts; migrations are idempotent and use lock semantics. Acceptable. |
| Forced reseed with `FORCE_SEED=true` overwrites operator-edited products | Operators warned in Netlify env-var description; only used when intentional. |
| Brevo daily limit on free tier (300/day) | Sufficient for launch volume; upgrade plan when exceeded. |
| Preview deploys leaking production data | Mitigated by separate preview Turso DB and disabled SMTP in preview scope. |
| `AUTH_SECRET` reuse across environments | Design mandates fresh per scope. |
| Credentials pasted into chat | Already happened twice during design; both keys flagged for rotation. Going forward: secrets only via Netlify UI and local `.env.local`. |

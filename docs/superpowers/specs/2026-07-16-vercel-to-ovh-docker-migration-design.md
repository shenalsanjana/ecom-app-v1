# Vercel → OVH Docker Migration — Design Spec

**Date:** 2026-07-16
**Status:** Approved for planning

## 1. Goal

Move Dressing Bear off Vercel onto a self-hosted stack on an OVHcloud VPS-1
(Ubuntu 24.04, 2 vCores, 4GB RAM, 40GB NVMe), running continuously via Docker
Compose (app + PostgreSQL + Nginx), with Let's Encrypt TLS on
`dressingbear.com`. No business logic changes except what self-hosting
strictly requires (Vercel Blob → local disk storage for uploads).

## 2. Current architecture (as audited)

- **Framework:** Next.js 16.2.4 (App Router), React 19.2.4, TypeScript, npm
  (single `package-lock.json`, no `engines` field, no `.nvmrc`).
- **Server:** stock `next start`, no custom server, no `output` mode set
  (defaults to non-standalone).
- **Auth:** NextAuth v5 beta (`next-auth@^5.0.0-beta.31`, `@auth/core`).
  Credentials provider only (email/phone + bcrypt). Config split:
  `app/_lib/auth.config.ts` (edge-safe, used by `proxy.ts` — Next 16's
  renamed `middleware.ts`) and `app/_lib/auth.ts` (full config incl.
  bcrypt-based provider). `trustHost: true`, `secret: process.env.AUTH_SECRET`.
- **Database:** PostgreSQL via Prisma (`prisma/schema.prisma`, 21 migrations
  already applied), currently hosted on **Vercel Postgres (Neon-backed)**,
  serving **live production data** (real customers/orders).
- **File storage:** admin-uploaded product/category images go to
  **Vercel Blob** in production (`app/api/blob/upload/route.ts` +
  `app/_components/admin/products/upload-button.tsx`, client-direct-upload
  flow). A local-disk fallback (`app/api/admin/upload-local/route.ts`,
  writes to `public/uploads/`) exists but is **hard-disabled** when
  `NODE_ENV === "production"`.
- **Background work:** none. No cron, no queue. SMTP (Nodemailer) and SMS
  (Notify.lk) sends are synchronous, awaited inline in request
  handlers/server actions.
- **API surface:** 13 route handlers under `app/api/`, all already
  `runtime = "nodejs"` where declared (three — `debug-db`, `search`,
  `wishlist/ids` — have no explicit runtime declaration but default to
  Node.js). Four routes must stay publicly reachable as webhooks/callbacks:
  `POST /api/payhere/webhook`, `POST /api/payments/koko/response`,
  `GET /api/payments/koko/return`, `GET /api/payments/mintpay/return`.
- **Testing:** Vitest (unit, `npm test`) + Playwright (e2e, `npm run test:e2e`).
- **CI:** one GitHub Actions workflow, `.github/workflows/migrate.yml`
  (manual `workflow_dispatch` only), runs `prisma migrate deploy` against a
  `DATABASE_URL` repo secret — this assumes the database is reachable from
  GitHub's runners over the public internet.

## 3. Vercel-specific dependencies (inventory)

| Item | Detail | Disposition |
|---|---|---|
| `vercel.json` | `buildCommand` only: `prisma generate && (prisma migrate resolve --applied ... \|\| true) && prisma migrate deploy && next build`. No crons/rewrites/headers/functions. | Remove |
| `@vercel/blob` + `@vercel/blob/client` | `app/api/blob/upload/route.ts`, `app/_components/admin/products/upload-button.tsx`, `next.config.ts` `remotePatterns` entry for `*.public.blob.vercel-storage.com` | Remove package; replace upload flow with local-disk storage (Docker volume) |
| `.github/workflows/migrate.yml` | Requires a publicly reachable `DATABASE_URL` | Remove — once Postgres is Docker-internal-only (never published), GitHub runners can no longer reach it. Migrations run on the VPS via the deploy script instead. |
| README "Vercel → Settings → Environment Variables" instructions | Docs only | Rewrite for `.env` + `docker compose` |

Not found / not applicable: `@vercel/analytics`, `@vercel/speed-insights`,
`@vercel/og`, `@vercel/kv`, `@vercel/edge-config`, Vercel Cron config,
`export const runtime = "edge"`, any `process.env.VERCEL*` read. `proxy.ts`
(Next's middleware convention) is a framework feature, not Vercel-specific —
it runs inside the Node.js process for `next start` / standalone output and
needs no change to work off-Vercel.

**Env var reconciliation:** the requested `.env.example` template included
`JWT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `SESSION_SECRET`. None of
these are read anywhere in this codebase — NextAuth v5 here uses
**`AUTH_SECRET`** and **`AUTH_URL`** only. The final `.env.example` uses the
app's actual variable names instead of the generic template names.

## 4. Decisions (from stakeholder Q&A, 2026-07-16)

1. **Live production data exists** — this is a real cutover, not a fresh
   setup. The Neon-backed Vercel Postgres database is not touched
   destructively at any point; the VPS gets a copy via `pg_dump`/`pg_restore`.
2. **Current DB host:** Vercel Postgres (Neon-backed). Dump must use the
   **direct** (non-pooled) connection string, per the existing README
   guidance for `migrate deploy`.
3. **Existing uploaded images:** fully migrate off Vercel Blob. A one-time
   script downloads every Blob-hosted file referenced in the database and
   rewrites the DB to point at the new local storage — no residual runtime
   dependency on Vercel Blob after cutover.
4. **Domain:** `dressingbear.com`, already owned. VPS not yet provisioned.
   All Docker/Nginx config is written to work today against fresh/seed data
   and to be immediately usable once the VPS exists; Nginx's `server_name`
   is parameterized (`${DOMAIN}`, substituted via `envsubst` at container
   start) defaulting to `dressingbear.com` rather than a bare
   `example.com` — this satisfies "insert your real domain" since the real
   domain is already known.

## 5. Proposed architecture

### 5.1 Dockerfile (multi-stage)

- **Base image: `node:22-slim` (Debian), not Alpine.** Prisma's query engine
  ships prebuilt binaries per `binaryTarget`; without an explicit
  `binaryTargets` override in `schema.prisma`, Alpine's musl libc causes a
  "query engine not found" failure at runtime. `node:22-slim` matches
  Prisma's default `debian-openssl-3.0.x` target with no schema changes, and
  avoids Alpine's added friction for `sharp`'s native bindings. `openssl`
  must be present in the final stage (Prisma needs it at runtime; slim
  images sometimes omit it — verified/installed explicitly if missing).
- **Stages:**
  1. `deps` — `npm ci` (production + dev, needed for `next build`).
  2. `tools` — copies `deps`'s `node_modules` + full source, runs
     `prisma generate` (schema-only, no DB access needed). This stage is
     the target for the `migrator` Compose service (§5.3) — it can run
     `prisma migrate deploy` / `db seed` / `admin:ensure` without ever
     needing `next build` to have succeeded, breaking what would otherwise
     be a circular dependency (migrating requires an image; building the
     app image requires migrations already applied — see the Postgres
     port-binding note in §5.3).
  3. `builder` (from `tools`) — runs `next build` with `output: "standalone"`
     (added to `next.config.ts`). Because several pages use ISR and query
     the database at build time (see §5.3), this `RUN` step needs
     `DATABASE_URL` and network access to Postgres — provided via a
     **BuildKit secret mount** (`RUN --mount=type=secret,id=database_url`),
     never a build `ARG`, so the connection string never lands in an image
     layer or `docker history`. Standalone output produces a pruned
     `server.js` + minimal `node_modules`, dramatically smaller than
     shipping the full `deps` tree.
  4. `runner` (final) — copies only `.next/standalone`, `.next/static`,
     `public/` (including the mounted uploads volume path) from `builder`.
     Runs as the base image's built-in **non-root** `node` user (uid 1000).
     Sets `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000`.
     `EXPOSE 3000`. `HEALTHCHECK` hits `GET /api/health`.
     `CMD ["node", "server.js"]`.
- **`sharp` added as an explicit `dependencies` entry** (currently only an
  optional transitive dependency of `next`) so Next's built-in image
  optimization reliably has a native binary in the container rather than
  falling back to a slower path or failing silently.
- No secrets baked into any layer; all runtime config comes from environment
  variables injected by Compose at container start.

### 5.2 New health endpoint

`app/api/health/route.ts` — unauthenticated, runs a trivial Prisma query
(`SELECT 1`-equivalent) and returns `{ status: "ok" }` / 500 with no stack
trace or internal detail in the body. Used by the Docker `HEALTHCHECK` and
by Compose's `depends_on: condition: service_healthy` gating for the app
tier's own readiness (Postgres has its own healthcheck; see 5.3).

*Note:* the existing `app/api/debug-db/route.ts` is unauthenticated and
returns raw error stack traces — a pre-existing issue unrelated to this
migration. Left untouched (out of scope per "don't change functionality
unless required"); flagged here for a separate follow-up decision.

### 5.3 docker-compose.yml

Three services on one internal bridge network (`app-network`), one named
volume for Postgres data, one named volume for uploaded images:

- **`postgres`** — official `postgres:16` image (version to be confirmed
  against the source Neon database before first restore — see §7). Named
  volume `pgdata` at `/var/lib/postgresql/data`. `healthcheck` via
  `pg_isready`. Env: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
  from `.env`. `restart: unless-stopped`. Log rotation via the `json-file`
  driver with `max-size`/`max-file` limits.
  **Port binding — deliberate, narrow exception:** `ports:
  ["127.0.0.1:5432:5432"]`, bound to the VPS's own loopback interface only.
  This is required because several storefront pages use Next's ISR
  (`export const revalidate = N` in `app/page.tsx`, `app/categories/page.tsx`,
  `app/categories/[slug]/page.tsx`, `app/products/[id]/page.tsx`,
  `app/deals/page.tsx`), which makes `next build` query the database at
  *build* time to prerender them — the same reason `next build` already
  requires `DATABASE_URL` on Vercel today. The `app` image build therefore
  needs to reach Postgres, and reaching a Docker Compose service by its
  service name during a *build* (as opposed to at container runtime) is a
  known-flaky, Docker-version-dependent path — so the build instead connects
  to `127.0.0.1:5432` using `network: host` on the build step (see §5.1),
  which is deterministic. Binding to `127.0.0.1` (not `0.0.0.0`) means the
  port is reachable only by processes on the VPS itself — never from the
  public internet or other machines — so this does not violate "don't
  expose Postgres publicly," but it is a narrower guarantee than "Docker
  internal network only," and is called out here explicitly rather than
  left implicit.
- **`app`** — builds from the repo `Dockerfile`. `depends_on: postgres:
  condition: service_healthy`. Named volume mounted for `public/uploads`
  (persistent across container recreation/redeploys). Reads `DATABASE_URL`
  (pointed at the `postgres` service by its Compose service name) and every
  other app env var from `.env` via `env_file`. No `ports:` mapping published
  to the host — only reachable from `nginx` over `app-network`.
  `restart: unless-stopped`, log rotation limits, healthcheck via
  `/api/health`.
- **`nginx`** — official `nginx:alpine` (fine here; only Node/Prisma need
  the glibc base). Only service with `ports: ["80:80", "443:443"]`. Mounts
  the Nginx config, a Let's Encrypt cert volume, and a webroot volume for
  ACME HTTP-01 challenges. `restart: unless-stopped`, log rotation.

No `docker compose down -v` anywhere in any script (would delete the
Postgres volume). `docker compose build` / `up -d` / `run --rm` only.

### 5.4 Nginx

- Reverse-proxies `/` to `app:3000`.
- Forwards `Host`, `X-Real-IP`, `X-Forwarded-For`, **and
  `X-Forwarded-Proto`**. The last one is not optional: NextAuth's
  `trustHost: true` derives the request origin (scheme + host) from these
  headers to build callback/redirect URLs. Without `X-Forwarded-Proto:
  https`, NextAuth thinks requests are plain HTTP behind a TLS-terminating
  proxy and produces wrong-scheme redirects/loops.
- `client_max_body_size 10m` (app's own upload cap is 5MB; this gives
  headroom without being unbounded).
- WebSocket upgrade headers (`Upgrade`/`Connection`) included as a no-cost
  safety net — the app doesn't use WebSockets today, but Next.js HMR-style
  upgrade headers are harmless to proxy through and avoid a config change if
  that ever changes.
- Basic security headers (`X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, etc.).
- HTTP (port 80) serves the ACME challenge webroot and redirects everything
  else to HTTPS once a certificate exists.
- `server_name` is `${DOMAIN}` substituted via `envsubst` from the
  container's environment at startup (`nginx:alpine`'s built-in
  `docker-entrypoint.d` templating), defaulting to `dressingbear.com`.

### 5.5 File storage (Vercel Blob → local disk)

- `app/api/admin/upload-local/route.ts`: remove the
  `NODE_ENV === "production"` block that currently disables it in prod. This
  becomes the only upload path.
- `app/_components/admin/products/upload-button.tsx`: remove the
  `@vercel/blob/client` branch; always POST to the local upload route.
- Files continue to land at `public/uploads/<name>` (unchanged path/URL
  shape — `/uploads/<filename>`, same-origin, no `next.config.ts`
  remotePattern needed), now backed by a Docker named volume instead of
  ephemeral container disk, so uploads survive redeploys/recreation.
- `next.config.ts`: drop the `*.public.blob.vercel-storage.com`
  `remotePatterns` entry (no longer needed post-migration — all remaining
  entries, e.g. `picsum.photos`, are untouched).
- `@vercel/blob` removed from `package.json` dependencies.

### 5.6 Environment variables

`.env.example` (production) is generated from the **actual** env vars this
codebase reads (compiled by full-repo grep during the audit), not the
generic template — every real var is included, no unused placeholders:

```
NODE_ENV=production
PORT=3000
DOMAIN=dressingbear.com

POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public

AUTH_SECRET=
AUTH_URL=https://dressingbear.com
APP_URL=https://dressingbear.com

SAMPLE_ADMIN_EMAIL=
SAMPLE_ADMIN_PASSWORD=
SAMPLE_ADMIN_NAME=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

BRAND_NAME=
BRAND_EMAIL=
CONTACT_NUMBER=

NOTIFY_LK_USER_ID=
NOTIFY_LK_API_KEY=
NOTIFY_LK_SENDER_ID=

NEXT_PUBLIC_META_PIXEL_ID=
NEXT_PUBLIC_KOKO_ENABLED=false
NEXT_PUBLIC_DEBUG_CART=

PAYHERE_MODE=live
PAYHERE_MERCHANT_ID=
PAYHERE_MERCHANT_SECRET=
PAYHERE_APP_ID=
PAYHERE_APP_SECRET=

KOKO_ENABLED=false
KOKO_MODE=live
KOKO_MERCHANT_ID=
KOKO_API_KEY=
KOKO_PUBLIC_KEY=
KOKO_PRIVATE_KEY=
KOKO_PLUGIN_NAME=customapi
KOKO_PLUGIN_VERSION=1.0.1

MINTPAY_ENABLED=false
MINTPAY_MODE=live
MINTPAY_MERCHANT_ID=
MINTPAY_MERCHANT_SECRET=

ROYAL_EXPRESS_ENABLED=false
ROYAL_EXPRESS_USER=
ROYAL_EXPRESS_PASS=
ROYAL_EXPRESS_TENANT=royalexpress

CURFOX_MERCHANT_BUSINESS_ID=
CURFOX_BASE_URL=https://v2-operations.api.curfox.com
CURFOX_LOGIN_BASE_URL=https://v1.api.curfox.com
CURFOX_ORDER_CREATE_PATH=/api/merchant/order/single
CURFOX_WAYBILL_PDF_PATH_TEMPLATE=/api/merchant/order/print/{waybill_number}
CURFOX_ORIGIN_CITY_ID=
CURFOX_ORIGIN_WAREHOUSE_ID=
CURFOX_DEFAULT_WEIGHT_KG=1
```

`.env` (real values) stays gitignored — already covered by the existing
`.env*` / `!.env*.example` `.gitignore` rules; no change needed there.

## 6. Files to create / modify / remove

**Create:**
- `Dockerfile`, `.dockerignore`
- `docker-compose.yml`
- `nginx/nginx.conf`, `nginx/conf.d/app.conf.template`
- `app/api/health/route.ts`
- `scripts/deploy.sh`, `scripts/backup-db.sh`, `scripts/restore-db.sh`,
  `scripts/migrate-images-from-blob.ts`
- `Makefile`
- `.env.example`
- `DEPLOY_OVH.md`

**Modify:**
- `next.config.ts` — add `output: "standalone"`, drop Blob remotePattern
- `package.json` — add `sharp`, add convenience scripts (`docker:build`,
  `docker:up`, etc. if useful)
- `app/api/admin/upload-local/route.ts` — remove prod gate
- `app/_components/admin/products/upload-button.tsx` — drop Blob branch
- `README.md` — replace Vercel ops section with Docker/OVH pointers to
  `DEPLOY_OVH.md`
- `STUB_READINESS_STATUS.md` — add tracker row for this change

**Remove:**
- `vercel.json`
- `.github/workflows/migrate.yml`
- `@vercel/blob` dependency

**Untouched:** Prisma schema/migrations, all business logic (payments,
courier, auth, cart, orders), tests.

## 7. Database & asset migration procedure (risks)

This is a **user-run, documented procedure** in `DEPLOY_OVH.md` — it
requires Vercel/Neon account access and a provisioned VPS, neither of which
this session has. It cannot be executed or tested from here; it can only be
specified precisely and validated structurally (dump/restore commands,
script logic) against fresh/seed data.

1. **Confirm Postgres major version parity.** Run `SELECT version();`
   against the current Neon database (via Vercel dashboard's query tool or
   `psql`) before pinning the `postgres` service image. Default assumption
   is `postgres:16`; if Neon reports a different major version, the Compose
   file's Postgres image tag must match it before restore.
2. **Dump** (from a `postgres` client container so the client version always
   matches the server, regardless of local tooling):
   ```
   docker run --rm postgres:16 pg_dump "<NEON_DIRECT_URL>" \
     -Fc --no-owner --no-acl -f /tmp/dump.bak
   ```
   Uses the **direct** (non-pooled) Neon connection string — same
   requirement as the existing `migrate deploy` guidance in README.
   `--no-owner --no-acl` prevents restore failing on Neon-managed roles
   (`neon_superuser` etc.) that don't exist on the self-hosted Postgres.
   A full custom-format dump carries the `_prisma_migrations` table, so
   schema + data + migration state arrive consistent — `prisma migrate
   status` should report "up to date" post-restore with no `migrate resolve`
   needed.
3. **Restore** into the fresh `pgdata` volume, before the `app` container
   ever points at it: `pg_restore --no-owner --no-acl -d <target> dump.bak`.
4. **Image cutover**: `scripts/migrate-images-from-blob.ts` — a one-time
   script that queries the only two Blob-URL-bearing columns in the schema
   (confirmed by grepping every model): **`Category.image`** and
   **`VariantImage.url`**. For each row whose value matches
   `*.public.blob.vercel-storage.com`, downloads the file, writes it into
   the uploads volume, and updates the row to the new `/uploads/<name>`
   URL. Run once, after restore, before cutting DNS over.
5. **Rollback safety**: the dump is read-only against Neon — nothing on the
   source database is ever modified or deleted. If anything is wrong on the
   VPS, the existing Vercel deployment keeps serving unaffected until DNS is
   manually pointed at the new server. No irreversible step touches
   production data before that DNS cutover is a deliberate, separate action.
6. **What gets validated in this session, corrected**: this dev environment
   has **no Docker installed** (confirmed — `docker --version` fails) and
   **no local Postgres** (a pre-existing, already-documented constraint in
   this repo — `next build`'s ISR prerendering and `prisma migrate dev`
   both require a reachable `DATABASE_URL` that isn't available here
   either). Given that, this session validates: `npm run test` (Vitest),
   `npx tsc --noEmit`, `npm run lint`, and careful static review of every
   Docker/Compose/Nginx/script file (syntax, internal consistency, the
   sequencing logic above). It does **not** run `docker build`,
   `docker compose up`, or `npm run build` — there is no container runtime
   or database available to run them against. **Everything Docker/DB/cutover
   -related — image build, container boot, migration apply, persistence
   across recreation, Nginx→app reachability, health checks, the real Neon
   dump/restore, DNS cutover, and Let's Encrypt issuance — is validated for
   the first time on the actual VPS**, following the exact commands in
   `DEPLOY_OVH.md`. This is consistent with how this repo has always
   validated DB-dependent changes (tsc + Vitest as the local gate, real
   integration checked in the environment that actually has a database).

## 8. Backups (ongoing, post-migration)

- `scripts/backup-db.sh`: `pg_dump` (custom format) from the running
  `postgres` service via `docker compose exec`, written to a
  host-filesystem directory **outside** the `pgdata` volume, filename
  timestamped (`dressingbear-YYYYMMDD-HHMMSS.bak`). Keeps the most recent
  N backups (configurable, default 7), deleting older ones.
- `scripts/restore-db.sh`: takes a backup file path, restores into the
  running `postgres` service (with an explicit confirmation prompt — this
  is destructive to the target database).
- Scheduled via host `cron` (documented in `DEPLOY_OVH.md`), e.g. daily at
  02:00: `0 2 * * * /path/to/scripts/backup-db.sh >> /var/log/db-backup.log
  2>&1`. Credentials are read from `.env` by the script (not passed as CLI
  args) to avoid landing in shell history.
- `DEPLOY_OVH.md` explicitly recommends an **additional off-server backup**
  (e.g., synced to OVH Object Storage, S3, or downloaded periodically) since
  on-VPS backups alone don't protect against VPS loss/disk failure.

## 9. Out of scope / explicitly not changed

- Payment/courier business logic (PayHere, Koko, MintPay, Curfox) —
  untouched, only the deployment environment around them changes.
- `app/api/debug-db/route.ts` — pre-existing unauthenticated info leak,
  unrelated to this migration, flagged but not fixed here.
- Any UI/UX or feature behavior.
- Test suite content (tests run as-is against the new environment).

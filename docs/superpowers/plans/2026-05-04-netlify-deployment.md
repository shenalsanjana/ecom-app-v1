# Netlify Deployment + dressingbear.com — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the Next.js 16 e-commerce app to Netlify on `https://dressingbear.com` with persistent Turso (libSQL) database, Brevo SMTP, and split production/preview environments.

**Architecture:** Migrate Prisma datasource layer from local SQLite file to Turso via the libSQL driver adapter. Add Netlify build configuration that runs `prisma generate && prisma migrate deploy && tsx prisma/seed.ts && next build`. Seed gated by empty-DB check so re-deploys are safe. Production deploys from `main`; preview deploys from PRs use a separate Turso DB and have SMTP disabled.

**Tech Stack:** Next.js 16.2.4, Prisma 6.19, `@prisma/adapter-libsql`, `@libsql/client`, `@netlify/plugin-nextjs` 5.15, NextAuth v5 beta, Brevo SMTP.

**Spec reference:** `docs/superpowers/specs/2026-05-04-netlify-deployment-design.md`

---

## Important conventions

- **`[USER ACTION]`** tasks must be performed by the operator in a third-party dashboard (Turso, Brevo, Netlify). The engineer cannot complete these. They are blocking gates for downstream tasks.
- **Secrets handling:** Tokens, passwords, and API keys go directly into Netlify's env-var dashboard and the local `.env.local` file. They never appear in this plan, in commit messages, in `netlify.toml`, in chat, or in any committed file.
- This plan has no traditional unit tests — the deployment artifacts (`netlify.toml`, env-var wiring) are validated by build success and a smoke-test pass against a deploy preview, which is the verification gate before merging to `main`.

---

## File structure

**Files to create:**
- `netlify.toml` — Netlify build configuration (root)

**Files to modify:**
- `package.json` — add `@libsql/client` and `@prisma/adapter-libsql` dependencies
- `prisma/schema.prisma` — enable `driverAdapters` preview feature on the client generator
- `app/_lib/prisma.ts` — branch on `TURSO_DATABASE_URL` to use libSQL adapter in production, keep local SQLite for dev
- `prisma/seed.ts` — add empty-DB guard at top so seed is idempotent across redeploys
- `app/_lib/auth.config.ts` — add `trustHost: true`

**Files unchanged but referenced:**
- `app/_lib/auth.ts` — NextAuth instantiation (config spreads from `authConfig`, so the trustHost addition propagates)
- `prisma/migrations/**` — apply unchanged to Turso (libSQL is wire-compatible with SQLite)

---

## Task 1: Add libSQL adapter dependencies

**Files:**
- Modify: `package.json` (dependencies section)
- Modify: `package-lock.json` (auto-updated by npm)

- [ ] **Step 1: Install the two libSQL packages**

Run from project root:

```bash
npm install --save @libsql/client @prisma/adapter-libsql
```

Expected: both packages added to `dependencies` in `package.json`. No errors.

- [ ] **Step 2: Verify versions are compatible with Prisma 6**

Run:

```bash
node -e "const p=require('./package.json'); console.log({prisma:p.devDependencies.prisma, client:p.dependencies['@prisma/client'], adapter:p.dependencies['@prisma/adapter-libsql'], libsql:p.dependencies['@libsql/client']})"
```

Expected: prints all four versions. `@prisma/adapter-libsql` should be `^6.x` (matching Prisma 6).

If `@prisma/adapter-libsql` version is `7.x` or `5.x` (mismatched), force-install the 6.x line:

```bash
npm install --save @prisma/adapter-libsql@^6
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @libsql/client and @prisma/adapter-libsql for Turso"
```

---

## Task 2: Enable driverAdapters preview feature in Prisma schema

**Files:**
- Modify: `prisma/schema.prisma` (lines 6-8)

- [ ] **Step 1: Update generator block**

Replace lines 6-8 of `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}
```

With:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}
```

Datasource block (lines 1-4) stays exactly as-is — `provider = "sqlite"` works with libSQL.

- [ ] **Step 2: Regenerate the Prisma client**

```bash
npx prisma generate
```

Expected: "Generated Prisma Client (vX.Y.Z) to ./node_modules/@prisma/client". No errors. The output mentions "preview features" being enabled.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(prisma): enable driverAdapters preview for libsql adapter"
```

---

## Task 3: Branch the Prisma client singleton on TURSO env

**Files:**
- Modify: `app/_lib/prisma.ts` (entire file)

- [ ] **Step 1: Replace `app/_lib/prisma.ts` with this exact content**

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const log =
    process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

  if (process.env.TURSO_DATABASE_URL) {
    const adapter = new PrismaLibSQL({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter, log } as ConstructorParameters<typeof PrismaClient>[0]);
  }

  return new PrismaClient({ log } as ConstructorParameters<typeof PrismaClient>[0]);
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

**Why the type cast:** `adapter` lives behind the preview feature flag, so the public `PrismaClient` constructor types may not include it directly until preview features become stable. The cast is local and tightly scoped.

- [ ] **Step 2: Verify locally with no Turso env (existing behaviour)**

Confirm `.env.local` has `DATABASE_URL="file:./dev.db"` and **no** `TURSO_DATABASE_URL`. Then:

```bash
npm run build
```

Expected: build completes successfully. Local SQLite path is used (the `if` branch is skipped because `TURSO_DATABASE_URL` is unset).

If build fails with type errors on the `adapter` field, change the inline `as ConstructorParameters<typeof PrismaClient>[0]` cast to `as never` to bypass.

- [ ] **Step 3: Commit**

```bash
git add app/_lib/prisma.ts
git commit -m "feat(prisma): use libsql adapter when TURSO_DATABASE_URL is set"
```

---

## Task 4: Add empty-DB guard to seed script

**Files:**
- Modify: `prisma/seed.ts` (top of `main` function or equivalent entry point)

- [ ] **Step 1: Locate the seed entry point**

Open `prisma/seed.ts`. The file starts by importing Prisma and constructing a `PrismaClient`. Find the top-level `async` function that runs the seeding (it will contain the `prisma.category.upsert` call from line ~109). It is typically named `main` or equivalent.

- [ ] **Step 2: Insert guard at the top of the entry function**

Immediately after the entry function's opening brace and before any seeding logic, insert:

```ts
const existingCategoryCount = await prisma.category.count();
if (existingCategoryCount > 0 && process.env.FORCE_SEED !== "true") {
  console.log(
    `[seed] Skipping: ${existingCategoryCount} categories already present. ` +
    `Set FORCE_SEED=true to override.`,
  );
  await prisma.$disconnect();
  return;
}

if (existingCategoryCount > 0) {
  console.log(
    `[seed] FORCE_SEED=true detected; reseeding over ${existingCategoryCount} existing categories.`,
  );
}
```

This must be the first awaited statement in the entry function.

- [ ] **Step 3: Run locally with a fresh DB to verify seed still works**

```bash
npx prisma migrate reset --force
npx tsx prisma/seed.ts
```

Expected: reset wipes local SQLite, seed populates categories/products. Console shows seeding progress (no "Skipping" line because DB starts empty).

- [ ] **Step 4: Run seed a second time to verify guard fires**

```bash
npx tsx prisma/seed.ts
```

Expected output starts with:

```
[seed] Skipping: <N> categories already present. Set FORCE_SEED=true to override.
```

And exits 0 without re-seeding.

- [ ] **Step 5: Verify FORCE_SEED override works**

PowerShell:

```powershell
$env:FORCE_SEED="true"; npx tsx prisma/seed.ts; Remove-Item Env:FORCE_SEED
```

Bash:

```bash
FORCE_SEED=true npx tsx prisma/seed.ts
```

Expected: prints `[seed] FORCE_SEED=true detected; reseeding over <N> existing categories.` then runs the full seed.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): skip when DB has data; FORCE_SEED=true forces reseed"
```

---

## Task 5: Add `trustHost: true` to NextAuth config

**Files:**
- Modify: `app/_lib/auth.config.ts` (line 4 area)

- [ ] **Step 1: Update the authConfig export**

Replace lines 4-5 of `app/_lib/auth.config.ts`:

```ts
export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
```

With:

```ts
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
```

**Why:** Netlify proxies requests through its edge, so the Host header NextAuth sees may not match `AUTH_URL`. `trustHost: true` tells NextAuth to accept the forwarded host. Required for both production and preview URLs (`*.netlify.app`).

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: build succeeds. No new TypeScript errors. NextAuth route handlers compile.

- [ ] **Step 3: Commit**

```bash
git add app/_lib/auth.config.ts
git commit -m "feat(auth): trustHost for netlify proxied requests"
```

---

## Task 6: Create `netlify.toml`

**Files:**
- Create: `netlify.toml` (project root)

- [ ] **Step 1: Create the file with this exact content**

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

**Notes:**
- `publish = ".next"` is what `@netlify/plugin-nextjs` expects; the plugin rewrites it under the hood for SSR/Functions but the value must be set.
- `tsx` is in `devDependencies` and Netlify installs dev deps by default — no extra config needed.
- The build command chains with `&&`, so any failure (migration error, seed error) aborts the deploy before `next build` runs.

- [ ] **Step 2: Lint the file syntax locally**

Run:

```bash
node -e "console.log(require('fs').readFileSync('netlify.toml','utf8'))"
```

Expected: prints the file content. (No native TOML parser in Node stdlib; this just confirms the file exists and is readable. Netlify will validate during the actual build.)

- [ ] **Step 3: Commit**

```bash
git add netlify.toml
git commit -m "feat(netlify): add build config with prisma migrate + seed pipeline"
```

---

## Task 7: Local end-to-end build verification

**Files:** none modified.

- [ ] **Step 1: Sanity-check `package.json` scripts and deps**

```bash
npm run build
```

Expected: clean build, no errors. `app/_lib/prisma.ts` falls through to local SQLite branch because `TURSO_DATABASE_URL` is unset locally.

- [ ] **Step 2: Sanity-check the seed guard with the local DB**

```bash
npx tsx prisma/seed.ts
```

Expected: either "Skipping" (if local DB has data) or full seed run (if empty). No crash.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no new errors introduced by Tasks 1-6. Pre-existing warnings (e.g., the two unused-var warnings noted in stabilization spec) may persist; do not fix in this plan.

- [ ] **Step 4: No commit needed** — verification only.

---

## Task 8: [USER ACTION] Provision Turso databases

**This task is blocking** — Tasks 12 onward depend on it.

- [ ] **Step 1: Create Turso account**

If not already done, sign up at https://turso.tech. Free tier is sufficient.

- [ ] **Step 2: Create production database**

Via Turso dashboard or CLI (`turso db create dressingbear-prod`):
- Name: `dressingbear-prod`
- Region: closest to your customer base (e.g., `bom` for Sri Lanka — confirm in Turso UI)

Capture:
- **URL:** `libsql://dressingbear-prod-<your-org>.turso.io`
- **Auth token:** dashboard → Database → "Create Token" → role: read+write

Store both in your password manager. **Do not paste these into chat.**

- [ ] **Step 3: Create preview database**

Same process:
- Name: `dressingbear-preview`

Capture URL + auth token.

- [ ] **Step 4: Verify connectivity** (optional sanity check)

If you have the Turso CLI installed:

```bash
turso db shell dressingbear-prod "SELECT 1"
```

Expected: returns `1`.

---

## Task 9: [USER ACTION] Verify `dressingbear.com` in Brevo

**This task is blocking** for production email functionality.

- [ ] **Step 1: Add domain in Brevo**

Brevo dashboard → Senders, Domains & Dedicated IPs → Domains → "Add a domain":
- Domain: `dressingbear.com`

Brevo issues 4 records to add:
1. SPF (TXT)
2. DKIM record 1 (CNAME, e.g., `brevo1._domainkey`)
3. DKIM record 2 (CNAME, e.g., `brevo2._domainkey`)
4. DMARC (TXT)

- [ ] **Step 2: Add records in Netlify DNS**

Netlify dashboard → Domains → `dressingbear.com` → DNS settings → "Add record" four times:

| Type | Name | Value | TTL |
|---|---|---|---|
| TXT | `@` (or `dressingbear.com`) | (Brevo SPF value) | 3600 |
| CNAME | `brevo1._domainkey` | (Brevo DKIM 1 target) | 3600 |
| CNAME | `brevo2._domainkey` | (Brevo DKIM 2 target) | 3600 |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dressingbear@gmail.com` | 3600 |

If Brevo provides exact record values that conflict with the table above, **use Brevo's exact values** — the table above is illustrative.

- [ ] **Step 3: Trigger Brevo verification**

Back in Brevo → Domains, click "Authenticate" / "Verify" on `dressingbear.com`. May take a few minutes for DNS to propagate. Re-click after 5 minutes if pending.

Expected: SPF, DKIM1, DKIM2, DMARC all show ✓ in Brevo.

- [ ] **Step 4: Generate fresh SMTP key**

Brevo → SMTP & API → SMTP keys → "Generate a new SMTP key" → name it `netlify-prod`. Copy the value to your password manager. **Do not paste into chat.**

If a key was generated earlier (during design, including any leaked in chat), **delete those keys now** before proceeding.

---

## Task 10: [USER ACTION] Configure Netlify environment variables

**This task is blocking** for first deploy.

Netlify dashboard → Site settings → Environment variables → "Add a variable" for each row below.

When adding a variable, in the "Values" section choose either "Same value for all deploy contexts" or "Different value for each deploy context" — the second option lets you set production-only values that previews never see.

- [ ] **Step 1: Database (split scope)**

| Variable | Production value | Deploy previews value |
|---|---|---|
| `TURSO_DATABASE_URL` | (from Task 8 prod DB) | (from Task 8 preview DB) |
| `TURSO_AUTH_TOKEN` | (prod token) | (preview token) |

- [ ] **Step 2: Auth (production-only)**

Generate a fresh secret:

```bash
openssl rand -base64 32
```

Store the printed value in your password manager. Then add to Netlify:

| Variable | Scope | Value |
|---|---|---|
| `AUTH_SECRET` | Production | (the value just generated) |
| `AUTH_SECRET` | Deploy previews | (a different fresh value — re-run `openssl rand -base64 32`) |
| `AUTH_URL` | Production | `https://dressingbear.com` |
| `APP_URL` | Production | `https://dressingbear.com` |
| `NEXTAUTH_URL` | Production | `https://dressingbear.com` |

For `AUTH_URL`, `APP_URL`, `NEXTAUTH_URL` in deploy previews: leave **unset**. NextAuth with `trustHost: true` falls back to the request's forwarded host header, which on previews is the unique `*.netlify.app` URL.

- [ ] **Step 3: SMTP (production-only)**

| Variable | Production | Deploy previews |
|---|---|---|
| `SMTP_HOST` | `smtp-relay.brevo.com` | (leave unset) |
| `SMTP_PORT` | `587` | (leave unset) |
| `SMTP_USER` | `a9e490001@smtp-brevo.com` | (leave unset) |
| `SMTP_PASS` | (Brevo SMTP key from Task 9) | (leave unset) |
| `SMTP_FROM` | `Dressing Bear <no-reply@dressingbear.com>` | (leave unset) |

Leaving SMTP unset on previews ensures `mailer.ts` cannot send real email from a PR build. If `mailer.ts` throws on missing config (it does — see commit `082e006`), affected preview flows will surface errors loudly during smoke-test rather than silently spam customers.

- [ ] **Step 4: Brand and contact (all scopes)**

| Variable | Scope | Value |
|---|---|---|
| `BRAND_NAME` | All | `Dressing Bear` |
| `BRAND_EMAIL` | All | `dressingbear@gmail.com` |
| `CONTACT_NUMBER` | All | `+94 740545536` |

- [ ] **Step 5: Royal Express (production-only, disabled at first)**

| Variable | Scope | Value |
|---|---|---|
| `ROYAL_EXPRESS_ENABLED` | Production | `false` |
| `ROYAL_EXPRESS_API` | Production | `https://royalexpress.merchant.curfox.com/add-new-order` |
| `ROYAL_EXPRESS_USER` | Production | (real credential) |
| `ROYAL_EXPRESS_PASS` | Production | (real credential) |

Keep `ENABLED=false` until you've verified the API contract end-to-end with a real order on the live site.

- [ ] **Step 6: Do NOT set `FORCE_SEED`** — leave entirely absent. It only exists for one-shot reseeds initiated manually later.

- [ ] **Step 7: Verify env vars panel**

Confirm in the Netlify env-var page that all 14 variable names listed above appear. Spot-check that `TURSO_DATABASE_URL` shows two scopes (production + previews) with different (masked) values.

---

## Task 11: [USER ACTION] Confirm Netlify production branch is `main`

- [ ] **Step 1: Navigate to deploy settings**

Netlify dashboard → Site settings → Build & deploy → Continuous deployment → Branches and deploy contexts.

- [ ] **Step 2: Verify production branch**

If "Production branch" is **not** set to `main`, set it to `main` and save.

- [ ] **Step 3: Verify deploy previews are enabled**

Same page, "Deploy previews" → should be set to "Any pull request against your production branch & branch deploy branches". Adjust if needed.

---

## Task 12: Push develop to remote

**Files:** none modified.

- [ ] **Step 1: Verify you're on develop and the working tree is clean**

```bash
git status
```

Expected: `On branch develop`, `nothing to commit, working tree clean`.

- [ ] **Step 2: Push develop with all the new commits from Tasks 1-6**

```bash
git push origin develop
```

Expected: push succeeds. Tasks 1-6 commits land on `origin/develop`.

If `origin/develop` already exists and rejects the push (non-fast-forward), investigate before forcing — there may be commits on the remote that your local doesn't have.

---

## Task 13: Open PR `develop → main`

This produces the deploy preview that gates the production merge.

- [ ] **Step 1: Verify `main` exists on origin**

```bash
git ls-remote --heads origin main
```

If empty, push the current local `main` first:

```bash
git checkout main
git push -u origin main
git checkout develop
```

This pushes the empty/scaffolding `main` so a PR base exists. Netlify will see this push but the build will fail (no `netlify.toml` on `main` yet) — this is expected, ignore the failed build. The PR will overwrite this state.

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --head develop --title "Production deploy: full app + Netlify config" --body "$(cat <<'EOF'
## Summary
- First production push of the full app from `develop` to `main`
- Adds Netlify build config (`netlify.toml`)
- Migrates Prisma to Turso (libSQL adapter) for serverless persistence
- Adds seed guard so re-deploys are safe
- Adds `trustHost: true` for NextAuth on Netlify

## Spec / Plan
- Spec: docs/superpowers/specs/2026-05-04-netlify-deployment-design.md
- Plan: docs/superpowers/plans/2026-05-04-netlify-deployment.md

## Test plan
- [ ] Netlify deploy preview builds successfully (green)
- [ ] Smoke tests against the preview URL pass (see Task 14 in plan)
- [ ] No real customer email sent during preview (SMTP unset on previews)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed to stdout. Netlify auto-builds the preview within 30-60 seconds of the PR opening.

- [ ] **Step 3: Watch the preview build**

Open the PR in browser. Netlify deploy status appears as a check. Wait for "Deploy Preview ready!" comment from Netlify, which contains the unique `https://deploy-preview-<n>--courageous-hamster-b8bf85.netlify.app` URL.

If the build fails, check the Netlify build log. Common failures and fixes:
- `prisma migrate deploy` cannot connect → Turso URL/token wrong in preview-scope env vars
- `tsx: command not found` → ensure `tsx` is in `devDependencies` (it is), and Netlify installs dev deps (default behaviour)
- Type errors → re-run `npm run build` locally and resolve before re-pushing

---

## Task 14: Smoke-test the deploy preview

Run each of these against the deploy preview URL from Task 13. Mark each pass.

- [ ] **Step 1: Homepage**

Visit `<preview-url>/`. Expect: products render, images load, no console errors.

- [ ] **Step 2: Sign up**

`/signup` → create a new account with a throwaway email. Expect: redirect to `/account` or login. Verify in Turso preview DB:

```bash
turso db shell dressingbear-preview "SELECT email, createdAt FROM User ORDER BY createdAt DESC LIMIT 1"
```

Expected: the new user row appears.

- [ ] **Step 3: Sign in**

Sign out, then sign in with the same credentials. Expect: success, session cookie set.

- [ ] **Step 4: Add to cart + checkout**

Add a product to cart → proceed to checkout → fill guest fields → submit. Expect: order created. Verify in Turso preview DB:

```bash
turso db shell dressingbear-preview "SELECT id, customerEmail, totalCents, createdAt FROM \"Order\" ORDER BY createdAt DESC LIMIT 1"
```

Expected: the new order row appears. (`ROYAL_EXPRESS_ENABLED` is false on preview by default since it's production-only; courier API not called.)

- [ ] **Step 5: Wishlist + account pages**

While signed in: `/wishlist`, `/account`, `/account/orders`, `/account/addresses`, `/account/security`. Each loads. The order from Step 4 appears in `/account/orders`.

- [ ] **Step 6: 404**

Visit `<preview-url>/this-page-does-not-exist`. Expect: 404 page renders, not a generic Netlify 404.

- [ ] **Step 7: Reset-password page handles missing token**

Visit `<preview-url>/reset-password` (no `?token=` query). Expect: clean error message, no crash. (Regression check on commit `c1bbfe3`.)

- [ ] **Step 8: Search, deals, category loading skeletons**

Visit `<preview-url>/search?q=test`, `<preview-url>/deals`, `<preview-url>/categories/<some-slug>`. Loading skeletons appear briefly during first paint. (Regression check on commits `b673d91`, `578b58c`.)

- [ ] **Step 9: Forced error triggers boundary**

In `/account`, append `?forceError=1` if such a debug hook exists, or simply navigate while signed-out (which should redirect, not crash). The error boundary at `app/account/error.tsx` exists from commit `cb3bbc9` — confirm by visiting an internal route that a logged-out user's session would error on. Acceptable result: redirect to login, not blank page.

- [ ] **Step 10: Confirm no email was sent**

Check Brevo dashboard → Statistics → emails sent in the last hour. Expected: zero emails from any preview-related flow (since SMTP is unset in preview scope).

If any of Steps 1-10 fails, fix the underlying issue on `develop`, push, wait for new preview build, re-run failing step. Do not merge to `main` with a failing smoke test.

---

## Task 15: Merge PR to `main`

- [ ] **Step 1: Confirm all smoke tests passed**

Tick every checkbox in Task 14 in the PR body. If any are unchecked, return to Task 14 to resolve.

- [ ] **Step 2: Merge via GitHub UI or CLI**

```bash
gh pr merge --merge --delete-branch=false
```

(Use `--merge` not `--squash` to preserve commit history. Do not delete `develop` — keep it for ongoing work.)

Expected: merge commit lands on `main`. Netlify auto-triggers a production build on `main`.

- [ ] **Step 3: Watch the production build**

Netlify dashboard → Deploys. The new build appears at top with status "Building".

Build steps to verify in the log:
1. `prisma generate` — completes
2. `prisma migrate deploy` — applies migrations to **production Turso DB**, prints "Applied N migrations" or "No pending migrations"
3. `tsx prisma/seed.ts` — first run on prod: should print seed progress (DB is empty); shows the categories/products being upserted
4. `next build` — completes
5. Plugin packages Functions; deploy publishes

Total expected time: 2-4 minutes.

If any step fails, the deploy aborts. Fix on `develop`, re-PR, re-merge.

---

## Task 16: Post-launch verification on `dressingbear.com`

Once the production deploy is "Published", run these against `https://dressingbear.com`.

- [ ] **Step 1: DNS resolves**

```bash
nslookup dressingbear.com
nslookup www.dressingbear.com
```

Expected: returns Netlify's load-balancer IPs (`apex-loadbalancer.netlify.com` chain).

- [ ] **Step 2: HTTPS cert valid**

Visit `https://dressingbear.com` in browser. Expected: green padlock, certificate issuer "Let's Encrypt", no mixed-content warnings in DevTools console.

If cert isn't ready yet, Netlify auto-provisions on first hit — wait 1-2 minutes and refresh.

- [ ] **Step 3: Real password reset email round-trip**

`/forgot-password` → enter a real address you control → submit. Expected:
- Brevo → Statistics shows 1 transactional email sent
- Email lands in inbox (NOT spam)
- Reset link in email points to `https://dressingbear.com/reset-password?token=...`
- Clicking the link successfully resets the password

If email lands in spam: re-check DKIM/DMARC in Brevo (Task 9). The cause is almost always a missing or wrong DKIM record.

- [ ] **Step 4: Place a test order**

Go through full checkout flow. Verify in Turso production DB:

```bash
turso db shell dressingbear-prod "SELECT id, customerEmail, totalCents, status, createdAt FROM \"Order\" ORDER BY createdAt DESC LIMIT 1"
```

Expected: row appears. `ROYAL_EXPRESS_ENABLED=false` so courier API is not called.

- [ ] **Step 5: Sign in / sign out persistence**

Sign in → reload page → still signed in. Sign out → reload → still signed out. Confirms `trustHost: true` and secure cookies are functioning.

- [ ] **Step 6: Update memory**

Save a project memory recording that the production deploy went live on 2026-05-04 (or the actual date), with `dressingbear.com` pointing at site `courageous-hamster-b8bf85.netlify.app`. This helps future sessions orient quickly.

---

## Rollback procedure

If production breaks after Task 15:

1. **Netlify dashboard → Deploys → previous successful deploy → "Publish deploy"** — instant rollback of the running site to the prior revision.
2. **Diagnose** the failure via Netlify build logs and runtime function logs.
3. **Fix on `develop`**, open new PR, smoke-test preview, re-merge.

If a Turso migration broke the DB (rare, since we use idempotent `migrate deploy`):
- The local migrations folder is the source of truth.
- `turso db shell dressingbear-prod` and inspect `_prisma_migrations` table to identify the broken state.
- Most cases resolve by adding a corrective migration on `develop` and redeploying.

Do NOT issue destructive Turso operations (drop database, restore from backup) without confirming with the operator first.

---

## Out of scope (acknowledged, not in this plan)

- Payment gateway (PayHere/Stripe/etc.)
- Analytics, error tracking
- CDN beyond Netlify built-in
- Admin UI for product management
- Variants/inventory schema rework — covered by separate stabilization sub-project

---

## Spec coverage check

Mapping each section of `2026-05-04-netlify-deployment-design.md` to tasks here:

| Spec section | Plan tasks |
|---|---|
| 1. Database migration: SQLite → Turso | Tasks 1, 2, 3, 4 |
| 2. Netlify build configuration | Tasks 6, 11 |
| 3. Environment variables | Task 10 |
| 4. Auth and security | Task 5 |
| 5. Email domain authentication (Brevo) | Task 9 |
| 6. Cutover sequence | Tasks 8-15 |
| 7. Pre-launch smoke tests | Task 14 |
| 8. Post-launch verification | Task 16 |
| Risks and mitigations | Rollback procedure section |

No spec section is unaddressed.

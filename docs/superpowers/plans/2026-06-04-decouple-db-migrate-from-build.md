# Decouple DB Migration from the Vercel Build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all database-touching steps from the per-deploy Vercel build command and move migrations to a GitHub Action, so a paused/unreachable DB no longer fails an otherwise-fine deploy and production is no longer re-seeded on every deploy.

**Architecture:** `vercel.json` build command shrinks to `prisma generate && next build`. A new `.github/workflows/migrate.yml` runs `prisma migrate deploy` on push to `main` using a `DATABASE_URL` GitHub secret. Seeding and admin-ensure become deliberate manual npm scripts.

**Tech Stack:** Vercel (build config), GitHub Actions, Prisma CLI, npm scripts, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-06-04-decouple-db-migrate-from-build-design.md`

**Note on testing:** These are configuration/CI files with no unit-test framework. The "test" for each is a syntax/parse validation plus an assertion on the exact value. Full behavior is only observable on the first real push to `main` (after the `DATABASE_URL` secret is set) — that manual verification is captured in Task 5.

**Environment note:** Work in the worktree `c:\Devops\Projects\ecom-app-v1-dbdecouple`. Validation commands below use `node` with only built-ins (`JSON`, `fs`) so they need no `node_modules`.

---

## File Structure

- **Modify** `vercel.json` — build command only: `prisma generate && next build`.
- **Create** `.github/workflows/migrate.yml` — applies migrations on push to `main`.
- **Modify** `package.json` — add `db:deploy` script (manual `prisma migrate deploy`).
- **Modify** `README.md` — document the new deploy/migration/seed flow.

---

## Task 1: Slim the Vercel build command

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Replace the build command**

Current content of `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "prisma generate && (prisma migrate resolve --applied 20260527000000_add_user_role || true) && prisma migrate deploy && tsx prisma/seed.ts && tsx scripts/ensure-admin.ts && next build"
}
```

Replace the whole file with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "prisma generate && next build"
}
```

- [ ] **Step 2: Validate JSON and assert the exact build command**

Run (from the worktree root):

```bash
node -e "const v=require('./vercel.json'); if(v.buildCommand!=='prisma generate && next build'){console.error('WRONG:',v.buildCommand);process.exit(1)} console.log('OK:',v.buildCommand)"
```

Expected: `OK: prisma generate && next build`

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "build(vercel): drop DB migrate/seed from build command"
```

---

## Task 2: Add the migration GitHub Action

**Files:**
- Create: `.github/workflows/migrate.yml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/migrate.yml` with EXACTLY this content:

```yaml
name: DB Migrate

# Apply Prisma migrations whenever main changes. This used to run inside the
# Vercel build command; it was moved out so a paused/unreachable database no
# longer fails an otherwise-fine frontend deploy.
on:
  push:
    branches: [main]
    paths:
      - "prisma/migrations/**"
      - "prisma/schema.prisma"
      - ".github/workflows/migrate.yml"
  workflow_dispatch: {}

# Never run two migration jobs against the same database at once.
concurrency:
  group: db-migrate-main
  cancel-in-progress: false

jobs:
  migrate:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      # One-time baseline-drift fix preserved verbatim from the old Vercel build
      # command. Safe to delete once a clean `migrate deploy` is confirmed.
      - run: npx prisma migrate resolve --applied 20260527000000_add_user_role || true
      - run: npx prisma migrate deploy
```

- [ ] **Step 2: Validate the YAML parses**

The worktree has no `node_modules`, so use the repo's main `node_modules` for a YAML parse (the `yaml` package ships with the toolchain). From the worktree root:

```bash
node -e "const fs=require('fs');const p='c:/Devops/Projects/ecom-app-v1/node_modules/yaml';const YAML=require(p);YAML.parse(fs.readFileSync('.github/workflows/migrate.yml','utf8'));console.log('YAML OK')"
```

Expected: `YAML OK`

If the `yaml` package is not resolvable at that path, fall back to confirming the file matches the exact content above by eye, and rely on GitHub surfacing any syntax error in the Actions tab on first push. Do NOT guess at YAML edits — the content above is canonical.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/migrate.yml
git commit -m "ci(db): run prisma migrate deploy on push to main"
```

---

## Task 3: Add the `db:deploy` manual script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the script**

In `package.json`, the `scripts` block currently ends:

```json
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:reset": "prisma migrate reset --force"
  },
```

Change it to add `db:deploy` (note the added comma after `db:reset`):

```json
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "db:reset": "prisma migrate reset --force"
  },
```

- [ ] **Step 2: Validate JSON and assert the script exists**

Run:

```bash
node -e "const p=require('./package.json'); if(p.scripts['db:deploy']!=='prisma migrate deploy'){console.error('MISSING/WRONG db:deploy');process.exit(1)} console.log('OK db:deploy =',p.scripts['db:deploy'])"
```

Expected: `OK db:deploy = prisma migrate deploy`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(scripts): add db:deploy for manual prisma migrate deploy"
```

---

## Task 4: Document the new deploy/migration flow

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Deployment section**

Append a new section to the end of `README.md` (after the final existing section) with EXACTLY this content:

```markdown
## Deployment & Migrations

The Vercel build command is intentionally minimal:

```
prisma generate && next build
```

Database work is **not** part of the build, so a paused or unreachable database
no longer fails a frontend deploy.

- **Migrations** apply automatically via the `.github/workflows/migrate.yml`
  GitHub Action on every push to `main` that touches `prisma/`. It runs
  `prisma migrate deploy` using the `DATABASE_URL` GitHub Actions secret. You
  can also trigger it manually (workflow_dispatch) or run `npm run db:deploy`
  locally against the target database.
- **Seeding** is no longer run on every deploy (Postgres persists the catalog).
  Run it deliberately when you need to (re)load demo/catalog data:
  `npm run db:seed`.
- **Admin user** is ensured manually with `npm run admin:ensure`.

### Required GitHub secret

The migrate workflow needs a repository secret named `DATABASE_URL` containing
the database connection string. Set it under **Settings → Secrets and variables
→ Actions**. Keep this value out of `vercel.json` and any committed file.
```

(Note: the inner triple-backtick fence above is part of the README content — keep it.)

- [ ] **Step 2: Verify the section was added**

Run:

```bash
node -e "const s=require('fs').readFileSync('README.md','utf8'); if(!s.includes('## Deployment & Migrations')||!s.includes('Required GitHub secret')){console.error('README section missing');process.exit(1)} console.log('README OK')"
```

Expected: `README OK`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): document decoupled migration + seed flow"
```

---

## Task 5: Operator checklist (manual — not code)

These steps are performed by the human operator in external dashboards; they are not committed code, but the change is not "done" in production until they happen. List them in the PR description.

- [ ] **Rotate the Prisma DB credential** (it was previously exposed) and obtain the fresh `DATABASE_URL`.
- [ ] **Add the GitHub secret** `DATABASE_URL` (Settings → Secrets and variables → Actions) with the fresh value.
- [ ] **Update Vercel's `DATABASE_URL`** env var to the fresh value (Project → Settings → Environment Variables).
- [ ] **Resume the Prisma Postgres instance** if it is paused (otherwise the live site and the first migrate run will still fail).
- [ ] **Observe the first push to `main`:** the *DB Migrate* Action runs `prisma migrate deploy` successfully, and the Vercel deploy runs `prisma generate && next build` (no migrate/seed steps in the build log).

---

## Self-Review

**Spec coverage:**
- §1 Slim build command → Task 1. ✓
- §2 Migrations → GitHub Action (push to main, Node 20, npm ci, resolve baseline, migrate deploy, secret, concurrency) → Task 2. ✓
- §3 Seed/ensure-admin manual + add `db:deploy` → Task 3 (script) + Task 4 (docs). ✓
- §4 Secret + credential rotation → Task 5 (operator checklist) + Task 4 (README "Required GitHub secret"). ✓
- §5 Documentation → Task 4. ✓
- Known limitation (parallel migrate race) → documented in spec; no task needed (accepted, not solved). ✓
- Verification §1–4 → per-task validation steps; §4 first-push → Task 5. ✓

**Placeholder scan:** none — every file's exact content is provided.

**Consistency:** `DATABASE_URL` secret name is identical across Task 2 (`secrets.DATABASE_URL`), Task 4 (README), and Task 5. The migration id `20260527000000_add_user_role` matches the old build command verbatim. `db:deploy` value (`prisma migrate deploy`) matches between Task 3 and the Action's deploy step.
```

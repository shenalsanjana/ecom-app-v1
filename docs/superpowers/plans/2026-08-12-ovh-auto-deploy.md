# Gated Auto-Deploy to the OVH VPS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a push to `main` deploy to the OVHcloud VPS automatically, gated behind passing tests and an explicit human approval, instead of requiring a manual SSH session.

**Architecture:** One new GitHub Actions workflow with two jobs. A `test` job runs Vitest on a GitHub-hosted runner with no secrets. A `deploy` job — blocked on `test`, and declaring `environment: production` so GitHub pauses it for a required reviewer — SSHes into the VPS, runs the existing `scripts/deploy.sh` unchanged, then verifies `https://dressingbear.com/api/health`. No new deploy logic is written; this adds a remote trigger and safety rails around the script that already works.

**Tech Stack:** GitHub Actions, OpenSSH, Vitest, Node 22, Prisma 6, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-08-12-ovh-auto-deploy-design.md`

## Global Constraints

- **Node version in CI is `22`** — matches `Dockerfile`'s `node:22-slim` base for `deps`, `tools`, and `runner`. Do not use a different major.
- **`npx prisma generate` must run before Vitest** — `Dockerfile:24` does this explicitly; tests import types from `@prisma/client`.
- **Never weaken SSH host verification.** Host keys are pinned from the `VPS_SSH_KNOWN_HOSTS` secret. `StrictHostKeyChecking=no` and `ssh-keyscan` performed at runtime are both forbidden — they accept a machine-in-the-middle on every run.
- **`scripts/deploy.sh` is not modified by this plan.** It is invoked as-is.
- **Never add `docker compose down -v` anywhere** — it deletes the `pgdata` volume (DEPLOY_OVH.md §5).
- **Production domain is `dressingbear.com`** throughout.
- **Deploy path on the VPS is `/opt/dressingbear`** (DEPLOY_OVH.md §1.7).
- **Repo secret names, exactly:** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_KNOWN_HOSTS`.
- **Environment name, exactly:** `production`.
- **Do not add email/SMTP notification steps** (spec D5). GitHub already emails the repo owner on a failed workflow run; copying the app's SMTP credentials into repo secrets would add attack surface for no extra signal.

## File Structure

| File | Responsibility |
|---|---|
| `app/_lib/__tests__/admin-kpis.test.ts` | *(modify)* Stop hardcoding the low-stock threshold; assert against the exported constant so the test cannot drift from the source again. |
| `.github/workflows/deploy.yml` | *(create)* The entire CI/CD definition — test gate, approval gate, SSH deploy, health verification. Single file; no composite actions or reusable workflows, which would spread ~70 lines of config across several files for no gain. |
| `DEPLOY_OVH.md` | *(modify §4.1)* Document the CI flow as the normal deploy path, keeping the manual command as the fallback. |
| `README.md` | *(modify §Deployment & Migrations)* Note migrations now run through CI on approval. |
| `CLAUDE.md` | *(modify §3)* Replace the "no CI/CD auto-deploy" note written on 2026-08-12 with a pointer to the new workflow. |

Task 1 is a hard prerequisite for Task 2: `main` currently has one failing test, so a test gate added before that fix would block every deploy permanently.

---

### Task 1: Fix the stale low-stock threshold assertion

`app/_lib/__tests__/admin-kpis.test.ts` asserts `{ quantity: { lte: 5 } }`, but `app/_lib/admin-products.ts:9` defines `LOW_STOCK_THRESHOLD = 2`, changed deliberately in commit `c32d4da "fix: change stock threshold."`. The source is correct and the test was never updated alongside it. Importing the constant instead of hardcoding a literal prevents the same drift recurring.

**Files:**
- Modify: `app/_lib/__tests__/admin-kpis.test.ts:68-78`

**Interfaces:**
- Consumes: `LOW_STOCK_THRESHOLD` (a `number`, currently `2`) exported from `app/_lib/admin-products.ts`.
- Produces: nothing consumed by later tasks. Task 2 depends only on `npm run test` exiting `0`.

**Note on mocking:** `app/_lib/admin-products.ts` imports `@/app/_lib/prisma` at module scope, but this test file already mocks that module via `vi.mock("@/app/_lib/prisma", ...)` at line 9. Importing from `admin-products` is therefore safe and needs no additional mock.

- [ ] **Step 1: Confirm the test currently fails**

Run: `npx vitest run app/_lib/__tests__/admin-kpis.test.ts`

Expected: FAIL — 1 failed, 4 passed. The failure shows a diff of `"lte": 5` (expected) against `"lte": 2` (received) at `app/_lib/__tests__/admin-kpis.test.ts:75`.

- [ ] **Step 2: Import the constant**

Add this import directly below the existing `import { getDashboardKpis } from "../admin-kpis";` line (line 22):

```typescript
import { LOW_STOCK_THRESHOLD } from "@/app/_lib/admin-products";
```

- [ ] **Step 3: Assert against the constant**

Replace the whole `it("sums low-stock counts ...")` block (lines 68-78) with:

```typescript
  it("sums low-stock counts from both raw-material pools", async () => {
    orderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    plainStockCount.mockResolvedValueOnce(2);
    dtfDesignCount.mockResolvedValueOnce(1);

    const result = await getDashboardKpis();

    expect(plainStockCount).toHaveBeenCalledWith({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } } });
    expect(dtfDesignCount).toHaveBeenCalledWith({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } } });
    expect(result.lowStock).toBe(3);
  });
```

The `(threshold <=5)` fragment is dropped from the test name because the name would otherwise become the new place the value can go stale.

- [ ] **Step 4: Run the file's tests**

Run: `npx vitest run app/_lib/__tests__/admin-kpis.test.ts`

Expected: PASS — `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

- [ ] **Step 5: Run the whole suite to confirm a green baseline**

Run: `npm run test`

Expected: PASS — `Test Files 90 passed (90)`, `Tests 703 passed (703)`. (Baseline before this fix was 1 failed | 702 passed.) The `deploy` workflow in Task 2 is only safe to add once this is green.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/__tests__/admin-kpis.test.ts
git commit -m "test(admin-kpis): assert low-stock threshold from the exported constant

The test hardcoded lte: 5 while LOW_STOCK_THRESHOLD has been 2 since
c32d4da. Importing the constant keeps the assertion honest and stops the
same drift recurring the next time the threshold changes."
```

---

### Task 2: Add the gated deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: a green `npm run test` (Task 1); `scripts/deploy.sh` on the VPS at `/opt/dressingbear/scripts/deploy.sh`; the `GET /api/health` route at `app/api/health/route.ts`, which returns `{"status":"ok"}` with HTTP 200 and HTTP 500 otherwise.
- Produces: workflow jobs named `test` and `deploy`. Task 3's documentation refers to these names.

**Why these choices:**
- `concurrency` with `cancel-in-progress: false` — two overlapping runs of `prisma migrate deploy` against one production database is the single dangerous race here, so a second push queues rather than races. Cancelling is wrong: a cancelled deploy could be halfway through a migration.
- `environment: production` on the `deploy` job is what creates the approval pause. Without the environment configured in GitHub settings (Task 2, Step 6) the job does **not** pause — it deploys unattended.
- `timeout-minutes: 30` on `deploy` because `docker compose build app` on a 2-vCore VPS is slow; the default 360-minute timeout would hold a queued deploy hostage for hours if SSH hangs.
- No third-party actions beyond the two first-party `actions/*` ones. A marketplace SSH action would gain nothing over four lines of `ssh` and adds a supply-chain dependency that can read `VPS_SSH_KEY`.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/deploy.yml` with exactly this content:

```yaml
name: Deploy

on:
  push:
    branches: [main]

# Two deploys must never overlap: each runs `prisma migrate deploy` against the
# one production database. Queue instead of cancelling — a cancelled deploy
# could be interrupted mid-migration.
concurrency:
  group: production-deploy
  cancel-in-progress: false

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - name: Install dependencies
        run: npm ci

      # Mirrors Dockerfile:24 — the suites import types from @prisma/client.
      - name: Generate Prisma client
        run: npx prisma generate

      - name: Run tests
        run: npm run test

  deploy:
    name: Deploy to VPS
    needs: test
    runs-on: ubuntu-latest
    # Requires a `production` environment with a required reviewer configured in
    # repo settings. That configuration is what makes this job pause for
    # approval; without it this deploys unattended.
    environment: production
    timeout-minutes: 30
    steps:
      - name: Configure SSH
        env:
          SSH_KEY: ${{ secrets.VPS_SSH_KEY }}
          SSH_KNOWN_HOSTS: ${{ secrets.VPS_SSH_KNOWN_HOSTS }}
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh
          printf '%s\n' "$SSH_KEY" > ~/.ssh/id_deploy
          chmod 600 ~/.ssh/id_deploy
          # Host key is pinned from a secret. Never substitute a runtime
          # ssh-keyscan or StrictHostKeyChecking=no — both accept a MITM.
          printf '%s\n' "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts

      - name: Run deploy script on the VPS
        env:
          VPS_HOST: ${{ secrets.VPS_HOST }}
          VPS_USER: ${{ secrets.VPS_USER }}
        run: |
          ssh -i ~/.ssh/id_deploy \
              -o StrictHostKeyChecking=yes \
              -o BatchMode=yes \
              "$VPS_USER@$VPS_HOST" \
              'cd /opt/dressingbear && ./scripts/deploy.sh'

      - name: Verify the site is healthy
        run: |
          # deploy.sh returns as soon as `docker compose up -d` is issued, so
          # the app may still be booting. Poll for up to ~2 minutes.
          for attempt in $(seq 1 24); do
            if curl -fsS --max-time 10 https://dressingbear.com/api/health | grep -q '"status":"ok"'; then
              echo "Health check passed on attempt $attempt."
              exit 0
            fi
            echo "Attempt $attempt: not healthy yet, retrying in 5s..."
            sleep 5
          done
          echo "Health check FAILED: /api/health did not report ok within ~2 minutes." >&2
          exit 1

      - name: Clean up SSH key
        if: always()
        run: rm -f ~/.ssh/id_deploy
```

- [ ] **Step 2: Verify the YAML parses**

The `yaml` package is already a transitive dependency in `node_modules`, so this needs no install.

Run:

```bash
node -e "const fs=require('fs'),yaml=require('yaml');const d=yaml.parse(fs.readFileSync('.github/workflows/deploy.yml','utf8'));console.log('jobs:',Object.keys(d.jobs).join(', '));console.log('deploy needs:',d.jobs.deploy.needs);console.log('environment:',d.jobs.deploy.environment);console.log('concurrency:',JSON.stringify(d.concurrency));"
```

Expected output, exactly:

```
jobs: test, deploy
deploy needs: test
environment: production
concurrency: {"group":"production-deploy","cancel-in-progress":false}
```

If `jobs` prints anything else, or `deploy needs` is `undefined`, the file was transcribed incorrectly — re-copy it from Step 1 rather than hand-patching.

- [ ] **Step 3: Verify the health-check command matches the real route**

Confirm the grep pattern in the workflow matches what the route actually returns.

Run: `grep -n 'status.*ok' app/api/health/route.ts`

Expected: a line containing `return NextResponse.json({ status: "ok" });`. `NextResponse.json` serializes this without spaces, as `{"status":"ok"}`, which is what the workflow's `grep -q '"status":"ok"'` matches.

- [ ] **Step 4: Confirm the deploy script path and entrypoint exist**

Run: `test -x scripts/deploy.sh && head -2 scripts/deploy.sh`

Expected: exit 0, printing `#!/usr/bin/env bash` and `set -euo pipefail`. The `set -e` is what makes a failed migration fail the workflow step; if this file is not executable the `ssh` invocation in the workflow would fail.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add gated auto-deploy to the OVH VPS

Push to main runs Vitest, then pauses at the \`production\` environment
for a required reviewer before SSHing into the VPS to run the existing
scripts/deploy.sh and verify /api/health.

Deploys are serialized via a concurrency group so two runs can never
apply Prisma migrations against the production database concurrently.

Refs docs/superpowers/specs/2026-08-12-ovh-auto-deploy-design.md"
```

- [ ] **Step 6: Repository-owner setup (cannot be automated from here)**

These must be done in the GitHub UI and on the VPS before the workflow is functional. **Until step 6c is complete, the `deploy` job does not pause for approval.** Report these to the user rather than attempting them.

**6a. Generate a dedicated CI keypair** (on the user's machine, not the VPS). It must be a new keypair, never a reuse of a personal key, so it can be revoked without disrupting human SSH access:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/dressingbear_ci -N ""
ssh-copy-id -i ~/.ssh/dressingbear_ci.pub deploy@<VPS_IP>
```

**6b. Capture the host key** for the `VPS_SSH_KNOWN_HOSTS` secret:

```bash
ssh-keyscan -t ed25519 <VPS_IP>
```

**6c. Create the environment:** Settings → Environments → New environment → name it exactly `production` → enable **Required reviewers** and add yourself.

**6d. Add the four secrets** under Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `VPS_HOST` | The VPS IP (`139.99.91.133`) or hostname |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Full contents of `~/.ssh/dressingbear_ci`, including the `-----BEGIN`/`-----END` lines |
| `VPS_SSH_KNOWN_HOSTS` | Full output of the `ssh-keyscan` in 6b |

**6e. Verify the VPS working tree is clean** — `scripts/deploy.sh` runs `git pull origin main` under `set -e`, so any local commits or uncommitted edits on the VPS will fail the deploy (DEPLOY_OVH.md §3.3 warns about exactly this for `nginx/conf.d/app.conf`):

```bash
ssh deploy@<VPS_IP> 'cd /opt/dressingbear && git status --short && git log --oneline -1'
```

Expected: empty `git status` output, and a `git log` line matching `origin/main`.

**Optional hardening**, not required for this plan: restrict the CI key in `/home/deploy/.ssh/authorized_keys` with a forced command so a leaked key can only trigger a deploy rather than open a shell:

```
command="/opt/dressingbear/scripts/deploy.sh",no-port-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... github-actions-deploy
```

If this is applied, the `ssh` line in the workflow still works unchanged — the forced command overrides whatever the client requests.

---

### Task 3: Update the deployment documentation

Three documents currently describe manual-only deployment. All three are read by future contributors (and by agents, via `CLAUDE.md`), so leaving them stale would send people to SSH in by hand and risk a `git pull` conflict against a CI-driven deploy.

**Files:**
- Modify: `DEPLOY_OVH.md:354-365` (§4.1)
- Modify: `README.md:220-229` (§Deployment & Migrations)
- Modify: `CLAUDE.md:35` (§3, the ops-specifics line)

**Interfaces:**
- Consumes: the job names `test` and `deploy`, the environment name `production`, and the four secret names from Task 2.
- Produces: nothing; this is the final task.

- [ ] **Step 1: Rewrite DEPLOY_OVH.md §4.1**

Replace the section that currently reads:

```markdown
### 4.1 Deploy an update

```bash
cd /opt/dressingbear
./scripts/deploy.sh
# or: make deploy
```

This pulls `main`, runs migrations, rebuilds the app image, and restarts
the stack — see `scripts/deploy.sh` for the exact sequence.
```

with:

```markdown
### 4.1 Deploy an update

Deploys run through GitHub Actions (`.github/workflows/deploy.yml`). Pushing
to `main` starts a `test` job; if it passes, the `deploy` job pauses at the
`production` environment and waits for a required reviewer. Approve it from
the Actions tab and it SSHes into this VPS, runs `scripts/deploy.sh`, then
verifies `https://dressingbear.com/api/health`.

Nothing reaches production without that approval click, and deploys are
serialized by a concurrency group so two can never apply migrations at once.

The manual path still works and remains the fallback when GitHub is
unavailable or you are mid-incident:

```bash
cd /opt/dressingbear
./scripts/deploy.sh
# or: make deploy
```

This pulls `main`, runs migrations, rebuilds the app image, and restarts
the stack — see `scripts/deploy.sh` for the exact sequence.

**Keep this working tree clean.** `scripts/deploy.sh` runs `git pull origin
main` under `set -e`, so a local commit or uncommitted edit on the VPS will
fail every CI deploy until it is resolved (see §3.3).

There is no automatic rollback. If a deploy fails the health check, fix it
here on the VPS — the previous container keeps serving if the failure
happened before `docker compose up -d`.
```

- [ ] **Step 2: Update README.md §Deployment & Migrations**

Replace the `- **Migrations** run via ...` bullet (lines 226-229) with:

```markdown
- **Deploys** run through GitHub Actions on push to `main`, gated on Vitest
  and a required-reviewer approval — see `.github/workflows/deploy.yml` and
  [DEPLOY_OVH.md](./DEPLOY_OVH.md) §4.1. `./scripts/deploy.sh` on the VPS
  remains the manual fallback.
- **Migrations** run via `docker compose --profile tools run --rm migrator
  npx prisma migrate deploy` (or `make migrate`), as an explicit step in
  `scripts/deploy.sh` before the app image is rebuilt — never automatically
  as part of the app's own build or startup.
```

- [ ] **Step 3: Update CLAUDE.md §3**

Replace the ops-specifics line at `CLAUDE.md:35`:

```markdown
- **See README for ops/domain specifics:** DB/migration/deploy details (PowerShell `$env:DATABASE_URL` invocation, the manual `scripts/deploy.sh` flow on the OVHcloud VPS — see `DEPLOY_OVH.md`; there is no CI/CD auto-deploy), payment providers (PayHere / Koko / MintPay), the Curfox / Royal Express courier integration, and admin bootstrap all live in `README.md` — don't duplicate them here.
```

with:

```markdown
- **See README for ops/domain specifics:** DB/migration/deploy details (PowerShell `$env:DATABASE_URL` invocation, the approval-gated `.github/workflows/deploy.yml` flow that runs `scripts/deploy.sh` on the OVHcloud VPS — see `DEPLOY_OVH.md`), payment providers (PayHere / Koko / MintPay), the Curfox / Royal Express courier integration, and admin bootstrap all live in `README.md` — don't duplicate them here.
```

- [ ] **Step 4: Verify no stale "no CI/CD" claims remain**

Run: `grep -rn "no CI/CD\|migrate\.yml" CLAUDE.md README.md DEPLOY_OVH.md`

Expected: no output. Any hit is a leftover reference to either the deleted `.github/workflows/migrate.yml` or the pre-Task-2 state, and must be corrected.

- [ ] **Step 5: Verify the docs point at files that exist**

Run: `test -f .github/workflows/deploy.yml && grep -rn "deploy\.yml" CLAUDE.md README.md DEPLOY_OVH.md`

Expected: exit 0, with at least one matching line from each of the three files.

- [ ] **Step 6: Commit**

```bash
git add DEPLOY_OVH.md README.md CLAUDE.md
git commit -m "docs: document the approval-gated CI deploy flow

DEPLOY_OVH.md, README.md and CLAUDE.md all described manual-only
deployment. Point them at .github/workflows/deploy.yml, keep the manual
scripts/deploy.sh path documented as the fallback, and warn that a dirty
VPS working tree breaks every CI deploy."
```

---

## Verification

After all three tasks:

- [ ] `npm run test` — expected `Test Files 90 passed (90)`, `Tests 703 passed (703)`.
- [ ] `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/deploy.yml','utf8'))"` — exits 0 silently.
- [ ] `grep -rn "no CI/CD\|migrate\.yml" CLAUDE.md README.md DEPLOY_OVH.md` — no output.

The first real end-to-end verification is the first push to `main` after the owner completes Task 2 Step 6: the `test` job should run, the `deploy` job should appear as "Waiting" pending review, and approving it should produce a green run. **Watch that first run** — an unapproved-but-still-deploying run means the `production` environment was not configured with a required reviewer.

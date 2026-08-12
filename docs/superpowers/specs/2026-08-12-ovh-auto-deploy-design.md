# Gated auto-deploy to the OVH VPS — design

**Date:** 2026-08-12
**Status:** Approved, pending implementation plan

## Problem

Pushing to `main` does nothing. There is no CI/CD of any kind in this repo.

The Vercel-to-OVH migration (`feat/vercel-to-ovh-docker-migration`, merged as
`06b40b0`) deliberately deleted the only workflow that existed —
`.github/workflows/migrate.yml`, removed in `44fd635` *"chore: remove
Vercel-specific build config and GitHub Actions migration workflow"*. That
workflow only ran `prisma migrate deploy` anyway; Vercel's own git integration
was what actually deployed the app. Both halves are now gone.

Today, shipping an update requires a human to SSH into the VPS and run
`./scripts/deploy.sh` by hand (DEPLOY_OVH.md §4.1). Nothing on the server polls
for new commits — the only cron entries documented are certbot renewal (§3.4)
and database backups (§4.5).

Separately, no automated test run gates anything: CLAUDE.md §2 requires
`npm run build` and `npm run test` before merge, but that rule is enforced only
by human discipline.

## Goals

- A push to `main` reaches production without anyone opening an SSH session.
- A human still explicitly approves before production is touched.
- Tests must pass before a deploy is even approvable.
- A deploy that leaves the site unhealthy fails loudly rather than silently.

## Non-goals

- **Auto-rollback.** A failed deploy needs a human on the box regardless, and
  rolling back an applied Prisma migration is not solved by re-tagging an
  image. Out of scope.
- **`npm run build` in CI.** The build queries Postgres at build time for ISR
  prerendering (see `docker-compose.yml`'s `app` build args), so running it on a
  GitHub runner needs a throwaway Postgres service container. Deferred.
- **Playwright e2e in CI.** Deferred.
- **A new deploy mechanism.** `scripts/deploy.sh` already performs the deploy
  correctly. This change adds a *remote trigger* and safety rails around it,
  and does not modify the script.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Manual approval gate, not fully automatic | Deploys run `prisma migrate deploy` against the live production database and restart live payment-webhook endpoints. A bad commit must not reach that unattended. |
| D2 | GitHub-hosted runner + SSH, not a self-hosted runner or webhook listener | No new long-running software to operate and patch on the production VPS, and no new HTTP endpoint to expose and secure. One SSH keypair is the entire footprint. |
| D3 | GitHub Environment with a required reviewer | Built into GitHub, auditable, no extra tooling. Auto-runs on push but pauses for an Approve click. |
| D4 | Post-deploy health check, no auto-rollback | Cheap, high-signal verification. Pairs with D-non-goal on rollback. |
| D5 | Rely on GitHub's built-in failed-run notification email | GitHub already emails the repo owner when a workflow run fails. Duplicating the app's SMTP credentials into repo secrets to send the same signal adds attack surface for no added information. |
| D6 | `concurrency` group so deploys queue rather than overlap | Two concurrent `prisma migrate deploy` runs against one database is the single genuinely dangerous race in this design. |

## Architecture

One new file: `.github/workflows/deploy.yml`. Two jobs.

### Job 1 — `test`

Trigger: `push` to `main`.

Runs on `ubuntu-latest`: checkout, Node setup with npm cache, `npm ci`,
`npm run test` (Vitest). Requires no secrets and no VPS access, so it is safe to
run before any approval gate.

No database service container is needed — the Vitest suites mock Prisma rather
than talking to a real database.

### Job 2 — `deploy`

`needs: test` — cannot start unless job 1 is green.
`environment: production` — this declaration is what creates the approval gate.
GitHub pauses the job and waits for a required reviewer.

`concurrency: { group: production-deploy, cancel-in-progress: false }` so a
second push queues behind an in-flight deploy instead of racing it (D6).

Steps:

1. **Establish SSH.** Load `VPS_SSH_KEY` into an ephemeral `ssh-agent` and write
   `VPS_SSH_KNOWN_HOSTS` to `~/.ssh/known_hosts`. The host key is pinned from a
   secret; `StrictHostKeyChecking=no` is not acceptable here because it would
   accept a machine-in-the-middle on every run.
2. **Deploy.** `ssh $VPS_USER@$VPS_HOST 'cd /opt/dressingbear && ./scripts/deploy.sh'`.
   The script is `set -euo pipefail`, so any failing stage — a `git pull`
   conflict, a failed migration, a failed image build — exits non-zero and fails
   the job.
3. **Verify.** `curl -fsS https://dressingbear.com/api/health`, retried with
   backoff for up to ~2 minutes to cover container restart time. That route
   (`app/api/health/route.ts`) issues a real `SELECT 1` through Prisma, so a
   successful response proves both the app and its database are live. A
   non-`ok` result after the retry window fails the job.

### Data flow

```
push to main
  └─> job: test  (npm ci, npm run test)          [no secrets]
        └─> job: deploy  [environment: production — PAUSES for reviewer approval]
              ├─ ssh-agent + pinned known_hosts
              ├─ ssh → /opt/dressingbear/scripts/deploy.sh
              │     (git pull → migrate deploy → admin:ensure → build app → up -d)
              └─ curl https://dressingbear.com/api/health  (retry ≤2 min)
```

## Prerequisite: fix the stale `admin-kpis` test

`app/_lib/__tests__/admin-kpis.test.ts` asserts `{ quantity: { lte: 5 } }`, but
`app/_lib/admin-products.ts:9` defines `LOW_STOCK_THRESHOLD = 2`, changed
deliberately in `c32d4da "fix: change stock threshold."`. The source is correct;
the test was simply never updated alongside it.

The fix is for the test to import `LOW_STOCK_THRESHOLD` and assert against it
rather than hardcoding a literal — which also prevents the same drift recurring
the next time the threshold changes.

This must land before the `test` job is meaningful; otherwise every deploy is
permanently blocked by a known-stale assertion.

## Secrets and manual setup

Four repository secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | The VPS IP or hostname |
| `VPS_USER` | `deploy` (the non-root sudo user from DEPLOY_OVH.md §1.2) |
| `VPS_SSH_KEY` | Private half of a **new, dedicated CI keypair** |
| `VPS_SSH_KNOWN_HOSTS` | Output of `ssh-keyscan <VPS_HOST>` |

`VPS_SSH_KEY` must be a purpose-generated keypair, never a reuse of a personal
key, so it can be revoked independently without disrupting human access.

Steps that must be performed by the repository owner (not automatable from
here):

1. Create a `production` environment under Settings → Environments and add
   yourself as a **required reviewer**. Without this the gate does not exist and
   the workflow deploys unattended.
2. Generate the CI keypair; append its public half to `/home/deploy/.ssh/authorized_keys`
   on the VPS.
3. Add the four secrets above under Settings → Secrets and variables → Actions.

Optional hardening, not required for the initial implementation: constrain the
CI key in `authorized_keys` with a forced command
(`command="/opt/dressingbear/scripts/deploy.sh",no-port-forwarding,no-pty ...`)
so a leaked key can only trigger a deploy rather than open a shell.

## Failure modes

| Failure | Behavior |
|---|---|
| Test fails | `deploy` never starts; no approval prompt is raised. |
| Reviewer never approves | Job waits, then times out per the environment's configured wait timer. Production untouched. |
| SSH unreachable / key rejected | Step 1 fails; `deploy.sh` never runs. |
| `git pull` conflicts on the VPS (local commits) | `deploy.sh` exits non-zero under `set -e`; job fails. DEPLOY_OVH.md §3.3 already warns against leaving VPS-local commits. |
| Migration fails | `deploy.sh` exits before the app image is rebuilt; the previously running container keeps serving. |
| Migration succeeds, then `docker compose build app` fails (e.g. a `next build` error CI's Vitest-only gate didn't catch) | Half-migrated state: the schema change is already live, but the old app container keeps serving old code against it. No auto-rollback — fix the build and redeploy promptly; see DEPLOY_OVH.md §4.1. |
| App boots unhealthy | Health check exhausts retries and fails the job. Requires manual intervention on the VPS — by design (D4). |
| A push wins the race against the preflight check | The newer commit lands and is deployed and migrated before the SHA-assertion step can catch it. The health check still runs and passes (it runs before the assertion so it verifies whatever is actually live). The SHA assertion then fails the job. Production is serving an unreviewed commit and needs manual intervention — see DEPLOY_OVH.md §4.1. |
| Two pushes in quick succession | Second deploy queues behind the first (D6). |

Every one of these surfaces as a failed workflow run, which triggers GitHub's
built-in failure notification email (D5).

## Documentation to update

- `DEPLOY_OVH.md` §4.1 — currently presents manual `./scripts/deploy.sh` as the
  only deploy path. Add the CI flow as the normal path, keeping the manual
  command documented as the fallback and for the initial cutover.
- `CLAUDE.md` §3 — the ops-specifics line was corrected on 2026-08-12 to say
  there is no CI/CD auto-deploy; it needs updating again once this lands.
- `README.md` §Deployment & Migrations — note that migrations now run via CI on
  approval, still as an explicit `deploy.sh` step rather than at app build or
  startup.

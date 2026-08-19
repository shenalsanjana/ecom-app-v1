# Stub / Change Readiness Status

> **Living tracker** — cell values reflect reality at commit time (not a frozen snapshot). The
> per-step **columns are status fields**; the **Required Implementation Rule** (bottom) is the
> authoritative order. This file lives at the repo **root** (never under `docs/`).

## Status

| Stub / Change | Purpose | Superpower Skill: Brainstorm | Superpower Executing Skill | Git Worktree | `/opsx:propose` | `/opsx:apply` | `/opsx:sync` | `/opsx:archive` | Current Status | TODO / Pending | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude-config-cleanup | Clean Claude/OpenSpec config, README DB docs, env example, and stub readiness tracking | Done | Applied | Done | Done | Applied | N/A | Done | Completed | — (merged to `main` `--no-ff`; worktree removed) | Executing skill = subagent-driven-development; doc-only → no deltas → sync N/A. Post-merge validation: `npm install` + `prisma generate` ok; `npm run test` ✅ 418/418; `npm run build` blocked only by missing `DATABASE_URL` (no local Postgres for build-time prerender) — environmental, not change-related (this change touched no source). |
| order-color-notifications | Snapshot database variant color/SKU at checkout and propagate through customer email/SMS and admin email/list/detail notifications | Done | subagent-driven-development | Done (`.worktrees/order-color-notifications`, `feat/order-color-notifications`) | Done | Applied | Done | Done | Archived — awaiting merge | Merge `feat/order-color-notifications` into `main` with `--no-ff`, then remove the worktree; push must be done by the user (agent has no git remote access). | All 6 task sections complete (tasks.md fully checked). `npm run test` ✅ 604/604; `npx tsc --noEmit` clean. `npm run build` and `npm run test:e2e` both blocked only by missing `DATABASE_URL`/local Postgres — environmental (compile + typecheck steps pass cleanly first) — **DB-backed integration and React rendering were never exercised locally; re-run build/e2e against a real DB or via CI before trusting the DB-touching paths in production.** Delta spec synced into `openspec/specs/product-color-variants/spec.md`; change archived to `openspec/changes/archive/2026-07-10-order-color-notifications/`. Picked up mid-branch: sections 1–2 were already committed; section 3 had an uncommitted RED test (code-review-flagged allocator bug) that this session fixed (GREEN) and committed, then sections 4–6 were implemented fresh; a post-hoc review against the fuller implementation plan (not just tasks.md) caught two more gaps — non-deterministic `listOrders()` item ordering and a missing unit-price field on the order-detail view — both fixed and committed before sync. Incidental fix: pre-existing tsc error in `app/checkout/__tests__/actions.test.ts` (unrelated mock-typing issue from section 1). Known pre-existing, out-of-scope, harmless NUL byte in `app/_lib/admin-orders.ts` (already on `main`) — not fixed, flagged for a separate follow-up. |
| vercel-to-ovh-docker-migration | Remove Vercel dependency and Dockerize the app for production deployment on an OVHcloud VPS (Docker Compose: app + PostgreSQL + Nginx, Let's Encrypt) | Done | subagent-driven-development | Done (`.worktrees/vercel-to-ovh-docker-migration`, `feat/vercel-to-ovh-docker-migration`, removed after merge) | N/A (no OpenSpec artifacts for this change — see note) | Applied (all 13 tasks) | N/A | N/A | Completed | Merged to `main` `--no-ff` (worktree removed, branch deleted); push to origin must be done by the user (agent has no git remote access). The real VPS validation (Docker build/boot, Neon dump/restore, Blob image cutover, Let's Encrypt) in DEPLOY_OVH.md is still pending — that's the user's next action once the VPS is provisioned. | All 13 planned tasks implemented and individually reviewed (task-scoped spec+quality gate each); one cross-task fix (Task 9's `deploy.sh` was missing the admin-ensure bootstrap step, caught during Task 12's review — restored Vercel-parity behavior rather than weakening the docs) and one final-whole-branch-review fix (docker-compose.yml's `app` build used `network: host` but `DATABASE_URL` still pointed at the hostname `postgres`, unresolvable outside the bridge network — fixed via `extra_hosts: ["postgres:127.0.0.1"]`, single source of truth preserved) were both found and closed before merge. `npx tsc --noEmit` clean; `npm run test` ✅ 696/697 on merged `main` (1 known pre-existing, unrelated failure in `app/_lib/__tests__/admin-kpis.test.ts` — stock-threshold mismatch introduced by `c32d4da`, predates this branch, confirmed via `git diff --stat` against the branch base, not fixed here per user decision). `npm run lint` has 4 pre-existing errors + 1 warning in files this branch never touched — also out of scope. This dev environment has no Docker installed and no local Postgres, so every Docker/DB-dependent check (image build, container boot, migrations, Nginx reachability, the real Neon dump/restore, Blob image cutover, Let's Encrypt issuance) was validated via careful static/cross-file review, not execution — deferred to the real VPS per `DEPLOY_OVH.md`. Spec: `docs/superpowers/specs/2026-07-16-vercel-to-ovh-docker-migration-design.md`. Plan: `docs/superpowers/plans/2026-07-16-vercel-to-ovh-docker-migration.md`. |
| home-conversion-refresh | Home page conversion + visual refresh from the client design handoff: new terracotta brand token, marquee announcement bar, hero rating chip + brand highlight, social-proof strip, card scarcity/bestseller signals, dark deals band with countdown, solid category tiles | Done | Not Started | Not Started | Not Started | Not Started | Not Started | Not Started | Brainstormed | Write the implementation plan (`writing-plans`), then `/opsx:propose`, then a `feat/home-conversion-refresh` worktree. | Spec: `docs/superpowers/specs/2026-08-19-home-conversion-refresh-design.md`; verbatim client handoff preserved at `docs/superpowers/specs/2026-08-19-home-conversion-refresh-handoff.md` (source: Claude Design project `Ecom-app-v1 setup`, `d904cb16-b993-4d2e-ae78-3b58508384a5`). Four agreed deviations from the handoff: (D1) `--brand` ships at `oklch(0.55 0.08 52)` not the handoff's `#b27657` — both that value (3.43:1) and the handoff's own suggested fallback `oklch(0.56 0.08 52)` (4.41:1) fail `scripts/check-contrast.ts` at WCAG AA 4.5:1; (D2) the social-proof strip's 4th item is 7-day returns, not a third free-shipping mention; (D3) only the `Bestseller` badge ships — `Trending` is unmeasurable in this schema and `Almost gone` duplicates the stock nudge; (D4) `badge`/`lowStock` are computed behind an opt-in `withSignals` flag passed only by `getFeaturedProducts`/`getDealsProducts`, keeping the handoff's home-page-only scope literal. `npm run check:contrast` is a merge gate for this change. |

## Workflow meaning

| Workflow Step | Purpose | What to Track | Implementation Allowed? |
| --- | --- | --- | --- |
| Superpower Skill: Brainstorm | Think through ideas, investigate problems, compare options, and clarify requirements before proposing a change | Ideas, decisions, rejected options, risks, open questions, out-of-scope items | No |
| Superpower Executing Skill | Select and run the correct Superpower skill for the implementation type before coding | Skill name, reason selected, execution notes, constraints found by the skill | Only after correct skill is selected |
| Git Worktree | Create isolated implementation workspace for the change | Worktree path, source branch, implementation branch, cleanup status | Yes, implementation should happen here |
| `/opsx:propose` | Create OpenSpec change artifacts | Proposal, design, specs, tasks, readiness for apply | No app code yet |
| `/opsx:apply` | Implement planned tasks | Task progress, files changed, tests, blockers | Yes, inside the worktree |
| `/opsx:sync` | Sync delta specs into main specs | Requirements added/modified/removed/renamed | Spec updates only |
| `/opsx:archive` | Finalize completed change | Archive path, sync status, final validation, remaining warnings | No new feature work |

## Status legend

| Status | Meaning |
| --- | --- |
| Not Started | No work started yet |
| Brainstormed | Brainstorming/investigation completed |
| Skill Selected | Correct Superpower executing skill selected |
| Worktree Created | Dedicated git worktree created for implementation |
| Proposed | OpenSpec proposal/design/tasks created |
| Ready for Apply | Proposal is ready for implementation |
| Applying | Implementation is in progress |
| Applied | Implementation tasks completed |
| Synced | Delta specs synced to main specs |
| Archived | Change finalized and archived |
| Blocked | Cannot continue until issue is resolved |
| Completed | Fully done |

## Change details

| Field | Value |
| --- | --- |
| Change name | claude-config-cleanup |
| Implementation branch | feat/claude-config-cleanup |
| Superpower executing skill | subagent-driven-development |
| Git worktree required | Yes |
| Worktree path | C:/Devops/Project/ecom-app-v1-claude-config-cleanup |
| Spec file | docs/superpowers/specs/2026-06-24-claude-config-cleanup-design.md |
| Plan file | docs/superpowers/plans/2026-06-24-claude-config-cleanup.md |
| Status file path | STUB_READINESS_STATUS.md |
| README in scope | Yes |
| `.env.local.example` in scope | Yes |
| Auth work in scope | No |
| Current next step | Apply remaining config/doc edits inside the worktree, then validate → archive → merge |

## TODO

| Category | TODO |
| --- | --- |
| Planning | Select the correct Superpower executing skill for this implementation |
| Planning | Create step-by-step implementation plan using the writing-plans skill |
| Git / Worktree | Create a dedicated git worktree for `feat/claude-config-cleanup` |
| Git / Worktree | Perform implementation inside the worktree, not directly in the main working tree |
| Git / Worktree | Keep worktree branch isolated from unrelated auth work |
| Development | Implement Claude config cleanup |
| Development | Update README PostgreSQL setup docs |
| Development | Fix `MinitPay` to `MintPay` |
| Development | Update `.env.local.example` to match PostgreSQL setup |
| Development | Create/update root `STUB_READINESS_STATUS.md` |
| Testing | Run validation commands |
| Testing | Confirm README and env examples are consistent |
| Testing | Confirm no unrelated auth implementation work is included |
| Git / Branch | Use `feat/claude-config-cleanup` off `main` |
| Git / Branch | Keep commits scoped to config cleanup and README/env/status file updates |
| Git / Branch | Merge back with `--no-ff` if approved |
| Archive | Run `/opsx:sync` if needed |
| Archive | Run `/opsx:archive` after implementation and validation are complete |
| Cleanup | Remove or clean up the git worktree after merge/archive when safe |

## Required Implementation Rule

Every project implementation should follow this order:

| Step | Required Action |
| --- | --- |
| 1 | Use `Superpower Skill: Brainstorm` to clarify the change and decisions |
| 2 | Use `/opsx:propose` to create or update proposal/design/tasks/spec artifacts |
| 3 | Select and run the correct Superpower executing skill for the implementation type |
| 4 | Create a dedicated git worktree for the implementation branch |
| 5 | Run `/opsx:apply` inside the worktree to implement tasks |
| 6 | Run tests and validation |
| 7 | Run `/opsx:sync` if delta specs need to be merged into main specs |
| 8 | Run `/opsx:archive` after implementation is complete |
| 9 | Merge with `--no-ff` if approved and clean up the worktree |

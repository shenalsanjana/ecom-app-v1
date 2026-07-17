# Stub / Change Readiness Status

> **Living tracker** — cell values reflect reality at commit time (not a frozen snapshot). The
> per-step **columns are status fields**; the **Required Implementation Rule** (bottom) is the
> authoritative order. This file lives at the repo **root** (never under `docs/`).

## Status

| Stub / Change | Purpose | Superpower Skill: Brainstorm | Superpower Executing Skill | Git Worktree | `/opsx:propose` | `/opsx:apply` | `/opsx:sync` | `/opsx:archive` | Current Status | TODO / Pending | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude-config-cleanup | Clean Claude/OpenSpec config, README DB docs, env example, and stub readiness tracking | Done | Applied | Done | Done | Applied | N/A | Done | Completed | — (merged to `main` `--no-ff`; worktree removed) | Executing skill = subagent-driven-development; doc-only → no deltas → sync N/A. Post-merge validation: `npm install` + `prisma generate` ok; `npm run test` ✅ 418/418; `npm run build` blocked only by missing `DATABASE_URL` (no local Postgres for build-time prerender) — environmental, not change-related (this change touched no source). |
| order-color-notifications | Snapshot database variant color/SKU at checkout and propagate through customer email/SMS and admin email/list/detail notifications | Done | subagent-driven-development | Done (`.worktrees/order-color-notifications`, `feat/order-color-notifications`) | Done | Applied | Done | Done | Archived — awaiting merge | Merge `feat/order-color-notifications` into `main` with `--no-ff`, then remove the worktree; push must be done by the user (agent has no git remote access). | All 6 task sections complete (tasks.md fully checked). `npm run test` ✅ 604/604; `npx tsc --noEmit` clean. `npm run build` and `npm run test:e2e` both blocked only by missing `DATABASE_URL`/local Postgres — environmental (compile + typecheck steps pass cleanly first) — **DB-backed integration and React rendering were never exercised locally; re-run build/e2e against a real DB or via CI before trusting the DB-touching paths in production.** Delta spec synced into `openspec/specs/product-color-variants/spec.md`; change archived to `openspec/changes/archive/2026-07-10-order-color-notifications/`. Picked up mid-branch: sections 1–2 were already committed; section 3 had an uncommitted RED test (code-review-flagged allocator bug) that this session fixed (GREEN) and committed, then sections 4–6 were implemented fresh; a post-hoc review against the fuller implementation plan (not just tasks.md) caught two more gaps — non-deterministic `listOrders()` item ordering and a missing unit-price field on the order-detail view — both fixed and committed before sync. Incidental fix: pre-existing tsc error in `app/checkout/__tests__/actions.test.ts` (unrelated mock-typing issue from section 1). Known pre-existing, out-of-scope, harmless NUL byte in `app/_lib/admin-orders.ts` (already on `main`) — not fixed, flagged for a separate follow-up. |
| vercel-to-ovh-docker-migration | Remove Vercel dependency and Dockerize the app for production deployment on an OVHcloud VPS (Docker Compose: app + PostgreSQL + Nginx, Let's Encrypt) | Done | subagent-driven-development | Not Started | N/A (no OpenSpec artifacts for this change — see note) | Not Started | N/A | N/A | Plan written | Create worktree `.worktrees/vercel-to-ovh-docker-migration` / branch `feat/vercel-to-ovh-docker-migration`, then apply this plan's 13 tasks task-by-task. | Live production data exists (Vercel Postgres/Neon-backed) — Task 12/DEPLOY_OVH.md documents a one-time, user-run dump/restore + Blob-image migration; not executed by the agent (no Vercel/Neon credentials available). This dev environment has no Docker installed and no local Postgres, so Docker/DB-related verification (image build, container boot, migrations, Nginx reachability) is deferred to the VPS — only `npm test`/`tsc --noEmit`/`npm run lint` and static file review are run locally. Spec: `docs/superpowers/specs/2026-07-16-vercel-to-ovh-docker-migration-design.md`. Plan: `docs/superpowers/plans/2026-07-16-vercel-to-ovh-docker-migration.md`. |

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

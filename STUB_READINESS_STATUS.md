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
| home-conversion-refresh | Home page conversion + visual refresh from the client design handoff: new terracotta brand token, marquee announcement bar, hero rating chip + brand highlight, social-proof strip, card scarcity/bestseller signals, dark deals band with countdown, solid category tiles | Done | subagent-driven-development | Done (`.worktrees/home-conversion-refresh`, `feat/home-conversion-refresh`) | Done | Applied | Done | Done | Completed — merged to `main` | Merged `--no-ff` as `f08f29c`; worktree removed and branch deleted. **Push to origin must be done by the user** (agent has no git remote access) — `main` is 25 commits ahead of `origin/main`. **`npm run build` and `npm run test:e2e` still owe a green run in CI or against the VPS.** **Three client-copy items remain open for decision — see Notes.** | Spec: `docs/superpowers/specs/2026-08-19-home-conversion-refresh-design.md`; verbatim client handoff at `docs/superpowers/specs/2026-08-19-home-conversion-refresh-handoff.md`. Plan: `docs/superpowers/plans/2026-08-19-home-conversion-refresh.md`. Validation on the branch: `npm run check:contrast` ✅ 8/8 (brand `#976445` at 4.59:1, cream-on-brand 4.77:1); `npx tsc --noEmit` ✅; `npm run test` ✅ 790/790 (97 files, +44 new); `npm run lint` ✅ no new findings (the 4 pre-existing errors + 1 warning in `order-items-editor.tsx`, `product-picker.tsx`, `buy-box-client.tsx`, `image-gallery.tsx`, `sms.ts` are untouched by this branch). `npm run build` **compiles successfully** but fails at prerender with `Can't reach database server at postgres:5432`, and `npm run test:e2e` cannot run for the same reason — both BLOCKED-ENVIRONMENTAL (this dev box has no local Postgres; `DATABASE_URL` points at the docker-compose service host). **Neither has had a green run — they must pass in CI or against the VPS before merge.** Five deviations from the client handoff are recorded in the spec (D1-D5), each forced by measurement: D1 the handoff's authoritative `#b27657` measures 3.43:1 and its own suggested fallback 4.41:1, both failing the repo's WCAG AA gate, so `--brand` ships at `oklch(0.55 0.08 52)`; D5 the handoff's luminance-threshold ink rule renders two of its six category tints at 1.73:1 and 2.38:1, so ink is chosen by measured contrast instead. The final whole-branch review (Opus) caught a defect in the plan's own stock math: `unitsForVariant` summed per-size minima against a **shared** design pool, overstating fulfillable units 3x (3 sizes x 10 blanks with design qty 1 returned 3, truth is 1) — fixed to `min(designQty, total blanks)`, spec §7 amended, test corrected. It also caught that `lowStock` did not follow the card's colour switch (moved onto `ProductCardVariant`) and that reduced-motion users lost three of four marquee messages to clipping. All five review findings fixed and re-reviewed clean. **Open for decision (parked, not defects of execution):** (1) the marquee has no pause/stop/hide control, a WCAG 2.2.2 Level A gap on every page — the only conforming fix adds a control to chrome the client specified precisely; (2) the deals countdown implies an expiry that does not exist, since `getDealsProducts` has no time bound, so at local midnight the clock resets on the same products; (3) the hardcoded `4.8` / `12,000+` / `850+` social-proof figures are presented as fact beside real review aggregates. All three are client-specified copy. The delta also corrects pre-existing drift: `openspec/specs/storefront-home/spec.md` still required a New Arrivals section that commit `0c02610` removed from the code. |
| storefront-taxonomy-foundation | Replace the flat `Category` model with a two-level Department -> Design taxonomy: schema, migration, seed, derived nested `/categories/{dept}/{design}` routes, 308 redirects for live indexed URLs, and a contrast gate widened to every tint | Done | Not recorded (no OPSX artifacts; the plan was executed task-by-task with tests per task) | Done (`.worktrees/`, `feat/storefront-taxonomy-foundation`, removed after merge) | N/A (no OPSX change directory - see Notes) | N/A | Done (direct reconciliation, not a delta merge - `07ad70a`) | Done (narrative only: `openspec/archive/2026-08-30-storefront-taxonomy-foundation.md`) | Completed - merged to `main` | **`npm run build` and `npm run test:e2e` still owe a green run** in CI or against the VPS - neither can run on this dev box. **Production seeding has no safe path** (`DEPLOY_OVH.md` §4.8) and two pre-deploy checks are pending there. Follow-ups B-E from design spec §9 (home sections, mega-menu, filter tree, PDP/cards) are open and each unblocked. | Merged `--no-ff` as `8ed2952` (15 commits); branch deleted. Spec: `docs/superpowers/specs/2026-08-30-storefront-taxonomy-foundation-design.md`. Plan: `docs/superpowers/plans/2026-08-30-storefront-taxonomy-foundation.md`. **This change skipped `/opsx:propose`** - it went brainstorm -> plan -> implement with no change directory, so there were no deltas to `/opsx:sync` and no artifact bundle for `openspec/changes/archive/`. The main specs drifted from shipped code and were reconciled directly on `docs/opsx-sync-taxonomy` (`07ad70a`, merged `--no-ff` as `e406c51`, pushed): added `openspec/specs/storefront-taxonomy/spec.md`, corrected `admin-category-management` and `home-conversion-signals`. Validation on merged `main` (`e406c51`): `npm run test` OK 849/849 across 101 files; `npx tsc --noEmit` clean; `npm run check:contrast` OK 35/35 (8 pairs + 27 tints). `npm run build` and `npm run test:e2e` are BLOCKED-ENVIRONMENTAL - `DATABASE_URL` points at the docker-compose host `postgres`, unreachable here, so build-time prerender and the Playwright redirect specs cannot execute; typechecking moved into CI at `fa9e62d`, so that gate does run there. Design decisions worth remembering: rename over drop-and-recreate (the live `Category` rows already *were* designs, so rows, FKs and the slug-history cascade survive); nested paths are **derived** from a design's current department, never stored; `cat`/`dino` deliberately unrenamed, which is why single-segment resolution must check current designs before either history table; `Cap` ships `#A59585` because the canvas's `#8E7A66` measures 3.51:1 and fails AA. Two defects were caught late and fixed on-branch: `updateCategory` was the second write path to the denormalised `Product.departmentSlug` invariant and left products stamped with the old department when a design moved (`595e2be`) - which is precisely the first post-deploy action, since the migration backfills every pre-existing design to `women`; and `/categories` advertised all four departments when production has designs under only one, producing three indexable empty tiles (`767fc99`). |

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

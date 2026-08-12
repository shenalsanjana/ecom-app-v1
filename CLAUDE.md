# Dressing Bear - Engineering Standards

This file defines the foundational architecture and workflows for the Dressing Bear project.

## 1. Lifecycle: Brainstorm -> Propose -> Implement (combined workflow)

Every change follows this canonical order (readiness is tracked in `STUB_READINESS_STATUS.md`):

1. **Brainstorm** — use the Superpowers `brainstorming` skill (never `/opsx:explore`) to clarify the change; write the design spec to `docs/superpowers/specs/<YYYY-MM-DD>-<change-name>-design.md`.
2. **Plan** — use the Superpowers `writing-plans` skill to write `docs/superpowers/plans/<YYYY-MM-DD>-<change-name>.md`.
3. **Propose** — `/opsx:propose` creates the OPSX artifacts (`proposal.md` / `design.md` / `tasks.md`) under `openspec/changes/<change-name>/`, referencing the design spec.
4. **Select the executing skill** — Superpowers `subagent-driven-development` or `executing-plans`.
5. **Worktree** — create a dedicated git worktree for the `feat/*` branch.
6. **Apply** — `/opsx:apply` inside the worktree implements the tasks.
7. **Validate** — `npm run build` and `npm run test` (and `npm run test:e2e` for user flows).
8. **Sync** — `/opsx:sync` if delta specs need merging into main specs (skip for doc-only changes with no deltas).
9. **Archive** — `/opsx:archive` (use `--skip-specs` for doc-only changes); the human narrative lives in `openspec/archive/`.
10. **Integrate** — merge the branch with `--no-ff` and clean up the worktree.

New specs go to `docs/superpowers/specs/`; the legacy `docs/spec/` folder is frozen and retained for history only.

## 2. Development Workflow
- **Branching:** `main` is the integration branch. Use short-lived `feat/*` or `fix/*` branches off `main` for substantial work, or commit small fixes directly to `main`. The `develop` branch was retired in 2026-05 — historical commits referencing "merge develop into main" predate this change.
- **Commit Process:** Follow the rules in `openspec/COMMIT_PROCESS.md`.
- **Validation:** Every change must be verified with `npm run build` and `npm run test` (Vitest) before merge; run `npm run test:e2e` (Playwright) when touching user flows.

## 3. Architecture Guidelines
- **Framework:** Next.js 16 (App Router).
- **Server vs. Client:**
    - Favor Server Components for SEO and performance.
    - Client Components must be kept small and at the leaves of the component tree.
    - **Constraint:** Never render an `async` Server Component directly inside a `"use client"` component.
- **Auth:** NextAuth.js v5. Always ensure `secret` and `trustHost` are configured. Use standard `redirectTo` in Server Actions.
- **Database:** Prisma with **PostgreSQL** (`prisma/schema.prisma` provider is `postgresql`). Use the `nodejs` runtime for API routes that interact with Prisma.
- **See README for ops/domain specifics:** DB/migration/deploy details (PowerShell `$env:DATABASE_URL` invocation, the manual `scripts/deploy.sh` flow on the OVHcloud VPS — see `DEPLOY_OVH.md`; there is no CI/CD auto-deploy), payment providers (PayHere / Koko / MintPay), the Curfox / Royal Express courier integration, and admin bootstrap all live in `README.md` — don't duplicate them here.

## 4. Documentation
- **CLAUDE.md:** This file. Foundational repo guidance.
- **README.md:** Project overview and setup instructions.
- **docs/commands/:** Quick reference for OpenSpec and Superpower workflows.
- **openspec/archive/:** History of major implementations and brainstormed ideas.
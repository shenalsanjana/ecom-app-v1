# Design: `.claude` + CLAUDE.md Accuracy Cleanup — and Canonical Combined Workflow

- **Date:** 2026-06-24
- **Status:** Approved (brainstorming) — ready for implementation planning
- **Topic:** Reconcile the `.claude/` config and CLAUDE.md with how the repo actually works, **and**
  establish a canonical combined Superpower + OpenSpec/OPSX + git-worktree workflow
- **Change name:** `claude-config-cleanup`
- **Implementation branch:** `feat/claude-config-cleanup` (off `main`)
- **Executing skill:** Superpowers `subagent-driven-development`
- **Scope owner:** Engineering (Dressing Bear)

## 1. Problem

The `.claude/` folder is **untracked** (`?? .claude/` at session start) — it was dropped in and
never reconciled with this repo's real conventions. As a result, CLAUDE.md and the `.claude/`
config make claims that are false or that point at files/folders that do not exist, and they will
actively mislead any agent that reads them.

Root cause: **two workflow systems are installed, and one is vestigial.**

- **Superpowers** — the *live* workflow. `brainstorming → writing-plans → executing-plans`, with
  design specs in `docs/superpowers/specs/` (~18 dated `*-design.md` files, active through
  2026-06-18) and implementation plans in `docs/superpowers/plans/` (~29 dated files).
- **OpenSpec / OPSX** — *installed but unused* for change management. The `opsx:*` / `openspec-*`
  skills and the `@fission-ai/openspec` CLI (`openspec` v1.4.1, globally available) exist, but the
  repo was never `openspec init`-ed: there is **no `.openspec.yaml`**, `openspec list` returns zero
  changes, and `openspec/` contains only `archive/` (2 files) + `COMMIT_PROCESS.md`. CLAUDE.md's
  `openspec/changes/` references therefore dangle.

CLAUDE.md blends the two systems and points at folders that do not exist. Separately, the custom
`git-spec` skill describes an entirely different project's git conventions (a `develop` branch,
Jira `trk-*` branch names, `done:`/`in-progress:`/`pending:` commit prefixes), contradicting the
repo's real model (`main` integration branch, `feat/*`/`fix/*` branches, Conventional Commits).

This change does two things at once: (a) **fix the drift** so the config stops misleading agents,
and (b) **adopt a single canonical workflow** that combines Superpowers, OPSX, and git-worktree
isolation — and dogfoods it by being the first change executed through it.

This design was validated by an exhaustive, adversarially-verified drift audit (5 documentation/
config surfaces, 62 findings: 58 verified, 3 manually confirmed after verifier timeout, 1 rejected).
Three findings assert facts about the codebase; all three were confirmed against source.

## 2. Goals

- Make **every** factual/procedural claim in `.claude/` and CLAUDE.md true.
- **Establish the combined Superpower + OPSX + git-worktree workflow as the project's canonical
  lifecycle**, documented in CLAUDE.md and tracked in a root `STUB_READINESS_STATUS.md`.
- **Actually adopt OPSX** — run `openspec init` so the OPSX CLI is functional, and execute this very
  change through the full pipeline (propose → apply → sync → archive).
- Fold in a small set of obviously-missing, high-value facts an agent needs (test commands; a single
  pointer to README for domain/ops detail) — without duplicating README.
- Make the committed `.claude/` config self-consistent so a fresh clone gets the documented toolset.
- Keep README, `.env.local.example`, and `STUB_READINESS_STATUS.md` mutually consistent.

## 3. Non-Goals

- **No application/source code changes.** This is a documentation/config change only; no runtime
  behavior changes.
- **No file moves.** The 5 legacy `docs/spec/` files stay where they are (annotated as legacy).
- **No broad README/`.env.local.example` rewrite.** They are edited only for the specific factual
  errors in §6.7 (SQLite→PostgreSQL, "MinitPay"→"MintPay"); structure and all other content untouched.
- **No auth work.** No Google OAuth / NextAuth implementation work is mixed into this branch — it
  stays isolated from the concurrent `docs(auth)` effort on `main`.

> **Reversal note (deliberate):** an earlier draft of this spec listed "no new workflow is invented"
> and "no OpenSpec adoption" as non-goals, and treated OpenSpec as an opt-in alternative. The user
> has since directed that the project adopt the combined workflow as canonical and make OPSX
> mandatory. Decisions #1, #2, and #6 below are updated accordingly; this is an intentional move
> from "cleanup only" to "cleanup + adopt canonical workflow," not a contradiction.

## 4. Approved Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Intent | Accuracy cleanup + light polish **+ establish the combined workflow as canonical** (supersedes the earlier "no redesign" framing) |
| 2 | OpenSpec / OPSX | **Mandatory stage** in the combined workflow (supersedes "opt-in alternative"). Documented as a required step, not an optional one |
| 3 | `git-spec` skill | **Reconcile to reality** — `main`, `feat/*`/`fix/*`, Conventional Commits |
| 4 | `settings.json` (fork) | **Promote all shared dev plugins** into committed `settings.json`; `settings.local.json` keeps only machine-specific overrides |
| 5 | `git-spec` reference doc (fork) | **Shrink to a pointer** — `references/.../git-specification.md` becomes a thin summary pointing at `openspec/COMMIT_PROCESS.md` as the single source of truth |
| 6 | OPSX initialization (fork, **revised**) | **Run `openspec init` (full adoption)** — supersedes the earlier "minimal `README` + `.gitkeep`" scaffolding. The repo is properly initialized so `openspec new change` / propose / apply / archive work |
| 7 | README + `.env.local.example` fix | **In scope** — correct the SQLite→PostgreSQL drift and "MinitPay"→"MintPay" spelling within this change |
| 8 | Executing skill | **`subagent-driven-development`** (user's choice over `executing-plans`) — parallelize the mostly-independent doc/config edits, with a coherence pass |
| 9 | Status tracker | **New `STUB_READINESS_STATUS.md` at the repo root** (NOT under `docs/`), tracking stub/change readiness across the combined workflow |
| 10 | Discovery phase | **Use Superpowers `brainstorming` for discovery — never `/opsx:explore`** (explicit project rule) |
| 11 | `/opsx:propose` status honesty | The tracker marks propose **Pending** until the real OPSX propose runs during implementation (we used brainstorming for discovery, so it is not yet "Done") |

**Locked decisions (confirmed, do not relitigate):** README cleanup in scope; `.env.local.example`
in scope (must stay consistent with README); `MinitPay`→`MintPay`; database docs SQLite→PostgreSQL;
historical archived plan docs unchanged; "Royal Express" wording unchanged; implementation on
`feat/claude-config-cleanup` off `main`; no Google OAuth/auth implementation on this branch.

## 5. Combined Workflow Model (now canonical)

The project adopts one canonical lifecycle that combines three layers. **Discovery uses Superpowers
`brainstorming`, never `/opsx:explore`.**

| Layer | Tool / skill | Produces |
|-------|--------------|----------|
| Discovery & design | Superpowers `brainstorming` | Design spec in `docs/superpowers/specs/<date>-<name>-design.md` |
| Human plan | Superpowers `writing-plans` | Step-by-step plan in `docs/superpowers/plans/<date>-<name>.md` |
| Change artifacts | `/opsx:propose` (OPSX CLI) | `proposal.md` / `design.md` / `tasks.md` under `openspec/changes/<name>/` |
| Isolation | git worktree | Dedicated workspace for the `feat/*` branch |
| Execution | Superpowers executing skill (here `subagent-driven-development`) running `/opsx:apply` | Implemented tasks; `tasks.md` checkboxes ticked |
| Spec sync | `/opsx:sync` | Delta specs merged into main specs |
| Finalize | `/opsx:archive` + `--no-ff` merge | Archived change; merged branch; cleaned-up worktree |

**How the planning layers relate (avoid two parallel plans):** the Superpowers `writing-plans`
output is the human-readable implementation plan; the OPSX `tasks.md` is the CLI-tracked task list
**derived from** that plan. They are not independent — `tasks.md` is the executable checklist that
`subagent-driven-development` works through inside `/opsx:apply`.

**Required Implementation Rule (canonical order):** Brainstorm → `/opsx:propose` → select & run the
executing skill → create the git worktree → `/opsx:apply` (in the worktree) → tests → `/opsx:sync`
→ `/opsx:archive` → `--no-ff` merge + worktree cleanup. The full table ships in
`STUB_READINESS_STATUS.md` (Appendix A) and is mirrored into CLAUDE.md §1.

**Two ordering notes (flagged, not smoothed over):**
1. The `STUB_READINESS_STATUS.md` **column order** (Brainstorm → Executing Skill → Git Worktree →
   propose → apply → sync → archive) differs from the **Required Implementation Rule order** (propose
   before executing-skill/worktree). The columns are **status fields**, not a sequence; the Required
   Rule is the **authoritative order**. The status file states this explicitly.
2. The Required Rule lists `/opsx:propose` (2) before "create worktree" (4). For **this** change,
   `openspec init` and `/opsx:propose` write repository files, so to honor "implementation happens in
   the worktree, never on `main`," the worktree is created **first** and `openspec init` + propose +
   apply all run inside it. This is a deliberate per-change sequencing of the same principle, recorded
   in the plan.

## 6. Change Inventory

Severity reflects **how badly the current state misleads an agent** (high / medium / low).

### 6.1 `CLAUDE.md` — headline deliverable

**Accuracy fixes**

- **§1 Lifecycle (high):** Rewrite §1 to document the **combined workflow** (the §5 table /
  Required Rule): Superpowers brainstorming for discovery (**not** `/opsx:explore`) → spec in
  `docs/superpowers/specs/`; `writing-plans` → plan in `docs/superpowers/plans/`; `/opsx:propose`
  → artifacts under `openspec/changes/<name>/`; executing skill; git worktree; `/opsx:apply`; tests;
  `/opsx:sync`; `/opsx:archive` → `openspec/archive/`; `--no-ff` merge + worktree cleanup. This
  replaces the dangling `openspec/changes/` references, the grammar defects ("do planing" → "write
  the plan"; "superpower planing skill" → the Superpowers `writing-plans` skill), and the malformed
  path token `<date-change-name.md>` → `<date-change-name>.md`. Point new specs at
  `docs/superpowers/specs/`; describe `docs/spec/` as legacy.
- **§3 Database (med):** Remove "SQLite (local)". `prisma/schema.prisma` declares
  `provider = "postgresql"` only; a postgresql schema cannot use a `file:` SQLite URL. State Prisma
  + PostgreSQL. Keep the (correct) `nodejs`-runtime-for-Prisma-routes guidance.

**Light-polish additions (lean — must NOT duplicate README, which owns domain/ops detail)**

> Guardrail: README is the single owner of domain/ops facts. Copying payment/courier/migration/admin
> specifics inline into CLAUDE.md would re-create the exact doc-duplication drift this change exists
> to kill. So those collapse to **one pointer**, not inline content.

- **§2 Validation (inline — workflow-level gate):** add `npm run test` (Vitest) and `npm run test:e2e`
  (Playwright) alongside the existing `npm run build`.
- **§3 (a single "see README" pointer, NOT inline copies):** one line directing agents to README for
  the domain/ops specifics README documents — the decoupled migration flow
  (`.github/workflows/migrate.yml`), Windows/PowerShell DB invocation, payment providers
  (PayHere / Koko / MintPay), the Curfox / "Royal Express" courier integration, and admin bootstrap.
  Safe because README's own SQLite drift is corrected in this same change (§6.7).

**Verified accurate — keep untouched:** §2 Branching, the `openspec/COMMIT_PROCESS.md` pointer,
§3 Framework (Next.js 16), §3 Auth (NextAuth v5), §4 documentation pointers, `openspec/archive/`.

### 6.2 `git-spec` skill — full reconcile (Decisions 3 + 5)

Rewrite `.claude/skills/git-spec/SKILL.md` to the real conventions, and **shrink**
`.claude/skills/git-spec/references/documentation/overview/git-specification.md` to a thin summary
pointing at `openspec/COMMIT_PROCESS.md` as the single source of truth. Replace the entire
Jira/`develop` convention (13 confirmed drifts):

- **Branch source:** `trk-*` Jira tickets → lowercase kebab-case `feat/*` / `fix/*` topic branches
  cut from `main`; small fixes may commit directly to `main`.
- **Commit messages:** `done`/`in-progress`/`pending`/`cleanup` prefixes → Conventional Commits
  (`feat`/`fix`/`docs`/`refactor`/`chore`/`test`/`perf` with a scope).
- **Remove entirely:** the `/` → ` > ` commit-header substitution section + schematic; the custom
  2/4-space body indentation rules; the User Story / Task / Epic → branch-type mapping; the
  feature + `stage` branch tree; the UPPERCASE `<SOURCE-BRANCH>:` PR-title format and `> STAGE` /
  `> TRK-NN` variants.
- **PR target:** `develop` → `main` (merge `--no-ff`, per COMMIT_PROCESS.md §4). Add the
  git-worktree-based implementation note consistent with the combined workflow.
- **Examples:** replace `trk-*` blocks with real commits from `git log`.
- **Frontmatter `description` (high):** auto-triggers on branch/commit/PR actions — must state the
  real model. **When-to-Use list:** drop Jira and feature+stage bullets.

### 6.3 `docs/commands/*.md` — reference docs CLAUDE.md §4 points to

- **`openspec.md` (high):** Reframe as the **OPSX stage of the combined workflow** (no longer
  "opt-in alternative"). Describe the real CLI lifecycle (`openspec init` once; then `openspec new
  change` / `opsx:propose` produce `proposal.md` / `design.md` / `tasks.md` under
  `openspec/changes/<name>/`; `/opsx:apply`; `/opsx:sync`; `/opsx:archive`). Clarify the two
  archives: manual `openspec/archive/YYYY-MM-DD-<name>.md` vs. the CLI archive. Replace the
  PowerShell-unfriendly `touch` example. Do **not** over-claim `docs/spec/` as dead (legacy specs;
  new specs go to `docs/superpowers/specs/`).
- **`superpowers.md` (high):** Add a **File locations** section (specs → `docs/superpowers/specs/`;
  plans → `docs/superpowers/plans/`). Describe the combined workflow and that **discovery uses
  `brainstorming`, never `/opsx:explore`**. Replace the fictional `activate_skill(...)` snippet with
  the real invocation (Skill tool / `/superpowers:<name>`). Keep the curated skill list.

### 6.4 `openspec/COMMIT_PROCESS.md` — CLAUDE.md §2 points to it

- §2 Commit Messages: remove "or documentation" from `chore`; add `docs(...)`, `test(...)`,
  `perf(...)` types. §3 Verification: add `npm test` (+ `npm run test:e2e` for user flows) before
  committing. §1 Branching and §4 Integration are accurate — keep; add a one-line note that
  substantial work is implemented in a dedicated git worktree per the combined workflow.

### 6.5 OPSX initialization & this change's OPSX artifacts (Decision 6, revised)

- **Run `openspec init`** (e.g. `openspec init --tools claude`) inside the worktree to create
  `.openspec.yaml` and the planning home so the OPSX CLI is functional. This **supersedes** the
  earlier minimal `README` + `.gitkeep` scaffolding.
- **Sequencing caution:** `openspec init` / `openspec update` regenerate the CLI-managed instruction
  files (`.claude/commands/opsx/*`, `.claude/skills/openspec-*`) and may add an OpenSpec section to
  AGENTS/CLAUDE files. Run init/update **before** the hand-edits in §6.1–6.4 so they are not
  clobbered, and do it all in the worktree so nothing lands on `main`.
- **Create this change in OPSX:** `openspec new change claude-config-cleanup`, then generate
  `proposal.md` / `design.md` / `tasks.md` (derived from this spec + the `writing-plans` plan).

### 6.6 `.claude/` OpenSpec tooling + settings

- **Dangling command (med):** `.claude/commands/opsx/apply.md` and `openspec-apply-change/SKILL.md`
  suggest `/opsx:continue` / `openspec-continue-change`, which don't exist. Because these are
  **CLI-generated**, prefer fixing them via `openspec update` (which should bring v1.4.1's correct
  text) rather than hand-editing; if `update` does not resolve it, hand-edit to `/opsx:propose`.
- **Settings split (high — Decision 4):** Promote the shared dev plugins from the **gitignored**
  `.claude/settings.local.json` into committed `.claude/settings.json`: `superpowers`, `code-review`,
  `frontend-design`, `playwright`, `vercel`, `prisma`, `github`, `feature-dev`, `code-simplifier`
  (joining `claude-md-management` + `commit-commands`). `settings.local.json` keeps only
  machine-specific overrides. (`.gitignore:47` excludes `settings.local.json`.)
- **Keep as-is:** `opsx:propose` / `opsx:explore` skill *bodies*; the `@fission-ai/openspec`
  dependency.

### 6.7 `README.md` + `.env.local.example` — DB-provider & payment-spelling fixes (Decision 7)

`prisma/schema.prisma` declares `provider = "postgresql"` (single schema, no SQLite variant), yet
README and `.env.local.example` still prescribe a SQLite `file:` URL — which a postgresql datasource
cannot accept. Fix consistently (schema is ground truth):

- **`README.md`:** Tech Stack "**Database:** SQLite with Prisma ORM" → "PostgreSQL (via Prisma ORM)";
  the env example (~line 40) and the three `$env:DATABASE_URL="file:./dev.db"; …` setup commands
  (~62/65/68) → a PostgreSQL placeholder, e.g.
  `postgresql://USER:PASSWORD@localhost:5432/dressingbear?schema=public` (note: a hosted Neon / Vercel
  Postgres dev branch also works). PowerShell `$env:…` form retained. "MinitPay" → "MintPay".
- **`.env.local.example`:** line 1 `DATABASE_URL="file:./dev.db"` → the same PostgreSQL placeholder,
  so example and README setup commands agree.

Not changed: the historical plan `docs/superpowers/plans/2026-05-25-payhere-checkout-implementation.md`
keeps its `file:./dev.db` (archived record); README's "Royal Express" wording (legitimate carrier
brand; env vars are `ROYAL_EXPRESS_*`).

### 6.8 `STUB_READINESS_STATUS.md` — NEW root tracker (Decision 9)

Create **`STUB_READINESS_STATUS.md` in the repo root** (NOT under `docs/`). It tracks stub/change
readiness across the combined workflow. Its full, authoritative content is in **Appendix A** and
must be reproduced verbatim (with `/opsx:propose` = **Pending** per Decision 11). It contains: the
main status table, the workflow-meaning table, the status legend, the change-details table, the TODO
table, and the **Required Implementation Rule** section. Keep README, `.env.local.example`, and this
file mutually consistent.

## 7. Spec-folder convention (resolves the dual-location ambiguity)

`docs/superpowers/specs/` is the **canonical, current** location for design specs (paired with
`docs/superpowers/plans/` for plans). `docs/spec/` holds **legacy** specs (5 files frozen since
2026-05-19), retained for history but not where new specs go. CLAUDE.md §1 and
`docs/commands/openspec.md` are updated to say so. No files are moved.

## 8. Validation / Acceptance Criteria

**Implementation logistics (confirmed):** executing skill = `subagent-driven-development`; work runs
in a **dedicated git worktree** for `feat/claude-config-cleanup` off `main`, merged `--no-ff`, then
the worktree is cleaned up. Subagents are partitioned **by file** (CLAUDE.md, git-spec, docs/commands,
COMMIT_PROCESS, README/`.env`, STUB) to avoid write conflicts; a final **coherence pass** confirms
README + `.env.local.example` + `STUB_READINESS_STATUS.md` agree (PostgreSQL everywhere; "MintPay").

**Acceptance criteria:**

- `npm run build` passes; `npm run test` passes (config-only change must not break tooling).
- OPSX is initialized: `.openspec.yaml` exists; `openspec list` shows `claude-config-cleanup`
  proposed → applied → archived by the end.
- `STUB_READINESS_STATUS.md` exists **at the repo root** (not under `docs/`), with all five tables +
  the Required Implementation Rule, and `/opsx:propose` shown honestly (Pending until run).
- CLAUDE.md §1 documents the combined workflow; discovery is Superpowers `brainstorming`, and there
  is **no `/opsx:explore`** presented as the discovery step.
- The `git-spec` skill (`SKILL.md` + reference doc) has **no** active `develop` / `trk-` /
  `done:`-`in-progress:`-`pending:` / feature-`stage` references. (Historical "develop retired" notes
  in CLAUDE.md §2 and COMMIT_PROCESS.md §1 remain.)
- `docs/commands/superpowers.md` has no `activate_skill(` snippet.
- Committed `.claude/settings.json` enables `superpowers` + the other shared plugins.
- No `file:./dev.db` / SQLite reference remains in `README.md` or `.env.local.example`; README Tech
  Stack says PostgreSQL; Payment Methods says "MintPay". (Historical plan doc unchanged.)
- **No auth files are touched** on the branch (no Google OAuth / NextAuth implementation).
- `.claude/` is staged and committed (previously untracked); change merged `--no-ff`; worktree
  removed.

## 9. Out of Scope

- No broad README/`.env.local.example` rewrite — only the §6.7 errors.
- README's "Royal Express" courier wording (legitimate carrier brand).
- The historical plan doc's `file:./dev.db` (archived record).
- Any Google OAuth / NextAuth / auth implementation work (separate concurrent effort on `main`).
- No application/source code changes; no runtime behavior changes.

## 10. Risks & Notes

- **`openspec init` side effects:** it regenerates CLI-managed `.claude` instruction files and may
  edit AGENTS/CLAUDE files. Mitigation: run init/update **first**, in the worktree, then layer the
  hand-edits; review its diff before committing so it doesn't silently revert our cleanup.
- **Parallel subagents in one worktree:** `subagent-driven-development` must partition tasks by file
  to avoid write conflicts; the cross-referential trio (README, `.env.local.example`, STUB) gets a
  single coherence pass. Faster than sequential, but coherence is the explicit acceptance gate.
- **Promoting plugins to committed settings (Decision 4)** enables them for every contributor on a
  fresh clone — intentional, but a behavior change. Assumes the `@claude-plugins-official`
  marketplace is available to clones (enable entries expected to no-op if absent; low risk for a
  solo/primary-maintainer repo).
- **Worktree isolation** keeps this change off `main` and away from the concurrent `docs(auth)` work.

## Appendix A — `STUB_READINESS_STATUS.md` content (authoritative; reproduce verbatim)

> Lives at the repo **root**, not under `docs/`. `/opsx:propose` is **Pending** (Decision 11): we used
> Superpowers brainstorming for discovery, so no OPSX proposal exists yet — it flips to Done when
> `/opsx:propose` runs during implementation. The per-step **columns are status fields**, not a
> sequence; the **Required Implementation Rule** (bottom) is the authoritative order.

### Main status table

| Stub / Change | Purpose | Superpower Skill: Brainstorm | Superpower Executing Skill | Git Worktree | `/opsx:propose` | `/opsx:apply` | `/opsx:sync` | `/opsx:archive` | Current Status | TODO / Pending | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude-config-cleanup | Clean Claude/OpenSpec config, README DB docs, env example, and stub readiness tracking | Done | Pending | Pending | Pending | Pending | Pending | Pending | Ready for implementation plan | Run openspec init, create worktree, propose, apply tasks, update README/env/status file | Active config cleanup change; executing skill = subagent-driven-development |

### Workflow meaning

| Workflow Step | Purpose | What to Track | Implementation Allowed? |
| --- | --- | --- | --- |
| Superpower Skill: Brainstorm | Think through ideas, investigate problems, compare options, and clarify requirements before proposing a change | Ideas, decisions, rejected options, risks, open questions, out-of-scope items | No |
| Superpower Executing Skill | Select and run the correct Superpower skill for the implementation type before coding | Skill name, reason selected, execution notes, constraints found by the skill | Only after correct skill is selected |
| Git Worktree | Create isolated implementation workspace for the change | Worktree path, source branch, implementation branch, cleanup status | Yes, implementation should happen here |
| `/opsx:propose` | Create OpenSpec change artifacts | Proposal, design, specs, tasks, readiness for apply | No app code yet |
| `/opsx:apply` | Implement planned tasks | Task progress, files changed, tests, blockers | Yes, inside the worktree |
| `/opsx:sync` | Sync delta specs into main specs | Requirements added/modified/removed/renamed | Spec updates only |
| `/opsx:archive` | Finalize completed change | Archive path, sync status, final validation, remaining warnings | No new feature work |

### Status legend

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

### Change details

| Field | Value |
| --- | --- |
| Change name | claude-config-cleanup |
| Implementation branch | feat/claude-config-cleanup |
| Superpower executing skill | subagent-driven-development |
| Git worktree required | Yes |
| Worktree path | To be created before implementation |
| Spec file | docs/superpowers/specs/2026-06-24-claude-config-cleanup-design.md |
| Status file path | STUB_READINESS_STATUS.md |
| README in scope | Yes |
| `.env.local.example` in scope | Yes |
| Auth work in scope | No |
| Current next step | Create worktree, run openspec init + `/opsx:propose`, then apply via subagent-driven-development |

### TODO

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

### Required Implementation Rule

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

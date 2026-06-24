# Design: `.claude` + CLAUDE.md Accuracy Cleanup

- **Date:** 2026-06-24
- **Status:** Approved (brainstorming) — ready for implementation planning
- **Topic:** Reconcile the `.claude/` config and CLAUDE.md with how the repo actually works
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
- **OpenSpec** — *installed but unused* for change management. The `opsx:*` / `openspec-*` skills,
  the `@fission-ai/openspec` CLI dependency, and CLAUDE.md's `openspec/changes/` references all
  exist, but `openspec/` contains only `archive/` (2 files) + `COMMIT_PROCESS.md`. There is no
  `openspec/changes/`, `openspec/specs/`, or `project.md`.

CLAUDE.md blends the two systems and points at folders that do not exist. Separately, the custom
`git-spec` skill describes an entirely different project's git conventions (a `develop` branch,
Jira `trk-*` branch names, `done:`/`in-progress:`/`pending:` commit prefixes), contradicting the
repo's real model (`main` integration branch, `feat/*`/`fix/*` branches, Conventional Commits).

This design was validated by an exhaustive, adversarially-verified drift audit (5 documentation/
config surfaces, 62 findings: 58 verified, 3 manually confirmed after verifier timeout, 1 rejected).
Three findings assert facts about the codebase; all three were confirmed against source.

## 2. Goals

- Make **every** factual/procedural claim in `.claude/` and CLAUDE.md true.
- Document **Superpowers as the primary/default workflow** and **OpenSpec as an opt-in
  alternative**, with each clearly delimited so neither misleads.
- Fold in a small set of obviously-missing, high-value facts an agent needs (test commands,
  Windows/PowerShell DB invocation, decoupled migrations, payment/courier domain notes, admin
  bootstrap) — lean, pointer-to-README where detail already exists.
- Make the committed `.claude/` config self-consistent so a fresh clone gets the documented toolset.

## 3. Non-Goals

- **No new workflow is invented.** Superpowers is already live; we document reality.
- **No file moves.** The 5 legacy `docs/spec/` files stay where they are (annotated as legacy).
- **No OpenSpec adoption.** We scaffold `openspec/changes/` so references resolve; we do not run
  `openspec init` or commit to using the CLI.
- **No README edits in this change.** `README.md` is treated as a source of truth and an edit
  target only in a separate follow-up (see §8).
- **No application code changes.** This is a documentation/config change only.

## 4. Approved Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Intent | Accuracy cleanup **+ light polish** (match reality, fold in missing high-value guidance, no new workflow) |
| 2 | OpenSpec apparatus | **Keep both** — Superpowers primary, OpenSpec documented as opt-in alternative; create missing `openspec/changes/` scaffolding so references resolve |
| 3 | `git-spec` skill | **Reconcile to reality** — `main`, `feat/*`/`fix/*`, Conventional Commits |
| 4 | `settings.json` (fork) | **Promote all shared dev plugins** into committed `settings.json`; `settings.local.json` keeps only machine-specific overrides |
| 5 | `git-spec` reference doc (fork) | **Shrink to a pointer** — `references/.../git-specification.md` becomes a thin summary pointing at `openspec/COMMIT_PROCESS.md` as the single source of truth |
| 6 | `openspec/changes/` scaffolding (fork) | **Minimal** — `README.md` + `.gitkeep` only |

## 5. Change Inventory

Severity reflects **how badly the current state misleads an agent** (high / medium / low).

### 5.1 `CLAUDE.md` — headline deliverable

**Accuracy fixes**

- **§1 Phase 1 (high/med):** Direct new specs to `docs/superpowers/specs/<date>-<name>-design.md`
  (the live location); describe `docs/spec/` as legacy specs retained for history. Fix grammar
  ("do planing" → "write the plan"), the non-existent skill name ("superpower planing skill" →
  the Superpowers `writing-plans` skill), the malformed path token
  `docs/superpowers/plans/<date-change-name.md>` → `<date-change-name>.md`, and the missing space
  before "with".
- **§1 Phase 3 (high):** `openspec/changes/` does not exist — the reference dangles. Reword so the
  active plan lives in `docs/superpowers/plans/` (Superpowers) and archival narrative moves to
  `openspec/archive/`; note `openspec/changes/` is the opt-in OpenSpec alternative (scaffolded in
  §5.5).
- **§1 overall (med):** Reframe the lifecycle so **Superpowers is the default** and **OpenSpec is
  the opt-in alternative** — stop blending the two into one flow.
- **§3 Database (med):** Remove "SQLite (local)". `prisma/schema.prisma` declares
  `provider = "postgresql"` only; a postgresql schema cannot use a `file:` SQLite URL. State Prisma
  + PostgreSQL. Keep the (correct) `nodejs`-runtime-for-Prisma-routes guidance.

**Light-polish additions (lean — must NOT duplicate README, which owns domain/ops detail)**

> Guardrail: README is the single owner of domain/ops facts (and an explicit non-edit target here,
> §3/§8). Copying payment/courier/migration/admin specifics inline into CLAUDE.md would re-create
> the exact doc-duplication drift this change exists to kill, and would bloat the file against
> Approach A. So those collapse to **one pointer**, not inline content.

- **§2 Validation (inline — this is the workflow-level gate, not domain detail):** add
  `npm run test` (Vitest) and `npm run test:e2e` (Playwright) alongside the existing `npm run build`.
- **§3 (a single "see README" pointer, NOT inline copies):** one line directing agents to README
  for the domain/ops specifics README already documents — the decoupled migration flow
  (`.github/workflows/migrate.yml`), Windows/PowerShell DB invocation (`$env:DATABASE_URL="…"; …`),
  payment providers (PayHere / Koko / MintPay), the Curfox / "Royal Express" courier integration,
  and admin bootstrap (`npm run admin:ensure` / `npm run admin:create`).

Note: the §3 Database **provider** correction (drop "SQLite", state PostgreSQL) stays **inline** —
it is an accuracy fix to an existing CLAUDE.md claim, and the pointer must not aim agents at
README's *uncorrected* SQLite wording (that is the §8 follow-up). The pointer covers
migration/deploy/payments/courier/admin only.

**Verified accurate — keep untouched:** §2 Branching, the `openspec/COMMIT_PROCESS.md` pointer,
§3 Framework (Next.js 16), §3 Auth (NextAuth v5), §4 documentation pointers, the `openspec/archive/`
references.

### 5.2 `git-spec` skill — full reconcile (Decision 3 + 5)

Rewrite `.claude/skills/git-spec/SKILL.md` to the real conventions, and **shrink**
`.claude/skills/git-spec/references/documentation/overview/git-specification.md` to a thin summary
that points at `openspec/COMMIT_PROCESS.md` as the single source of truth.

Replace the entire Jira/`develop` convention (13 confirmed drifts):

- **Branch source:** `trk-*` Jira tickets → lowercase kebab-case `feat/*` / `fix/*` topic branches
  cut from `main`; small fixes may commit directly to `main`.
- **Commit messages:** `done`/`in-progress`/`pending`/`cleanup` prefixes → Conventional Commits
  (`feat`/`fix`/`docs`/`refactor`/`chore`/`test`/`perf` with a scope, e.g.
  `feat(dispatch): …`).
- **Remove entirely:** the `/` → ` > ` commit-header substitution section and schematic; the custom
  2-space/4-space body indentation rules; the User Story / Task / Epic → branch-type mapping; the
  feature + `stage` branch tree; and the UPPERCASE `<SOURCE-BRANCH>:` PR-title format with its
  `> STAGE` / `> TRK-NN` variants.
- **PR target:** `develop` → `main` (merge with `--no-ff`, per COMMIT_PROCESS.md §4).
- **Examples:** replace `trk-*` example blocks with real commits pulled from `git log`
  (e.g. `feat(dispatch): admin tracking editor + DISPATCHED-aware order actions`,
  `fix(checkout): show full city catalogue in combobox (remove 80-item cap)`).
- **Frontmatter `description` (high):** the skill auto-triggers on branch/commit/PR actions, so its
  description must state the real model (no `develop`; `feat/*`/`fix/*`; Conventional Commits).
- **When-to-Use list:** rewrite to drop Jira and feature+stage bullets.

### 5.3 `docs/commands/*.md` — reference docs CLAUDE.md §4 points to

- **`openspec.md` (high):** Reframe as "OpenSpec (CLI) — opt-in alternative". Describe the real CLI
  lifecycle (`openspec` / `opsx:propose` produces `proposal.md` / `design.md` / `tasks.md` inside a
  CLI-created change directory under `openspec/changes/<name>/`). Stop placing "plan writing with
  superpowers" under an OpenSpec heading. Clarify the two archives: manual
  `openspec/archive/YYYY-MM-DD-<name>.md` (kept) vs. the CLI's own archive. Replace the
  PowerShell-unfriendly `touch` example. State up front that Superpowers (see `superpowers.md`) is
  the primary/default workflow. **Do not** over-claim `docs/spec/` as dead — it holds legacy specs;
  point new specs at `docs/superpowers/specs/` (this incorporates the one rejected audit finding's
  correction).
- **`superpowers.md` (high):** Add a **File locations** section — design specs →
  `docs/superpowers/specs/<YYYY-MM-DD>-<name>-design.md`; implementation plans →
  `docs/superpowers/plans/<YYYY-MM-DD>-<name>.md`. State Superpowers is primary and OpenSpec
  (see `openspec.md`) is the opt-in alternative. Replace the fictional `activate_skill(...)` bash
  snippet with the real invocation (Skill tool / `/superpowers:<name>`). The curated skill list
  itself is accurate — keep it.

### 5.4 `openspec/COMMIT_PROCESS.md` — CLAUDE.md §2 points to it

- §2 Commit Messages: remove "or documentation" from the `chore` bullet; add a `docs(...)` bullet
  ("Documentation and spec/plan changes"); add `test(...)` and `perf(...)` types.
- §3 Verification: add a line — run `npm test` (and `npm run test:e2e` when touching user flows)
  before committing, alongside the existing build + TS-error lines.
- §1 Branching and §4 Integration are accurate — keep. This file is the canonical git reference that
  the rewritten `git-spec` skill is reconciled toward.

### 5.5 `openspec/changes/` scaffolding — NEW (Decision 2 + 6)

Create `openspec/changes/` containing:
- `README.md` — explains the folder holds active OpenSpec change directories; states that
  Superpowers is the default/primary planning workflow and OpenSpec is the opt-in alternative
  (invoked only when explicitly requested).
- `.gitkeep` — so the empty directory is committed.

This makes the CLAUDE.md §1 and `docs/commands/openspec.md` references resolve. Do **not** run
`openspec init` and do **not** pre-create `openspec/specs/` (the sync flow self-creates it).

### 5.6 `.claude/` OpenSpec tooling + settings

- **Dangling command (med):** `.claude/commands/opsx/apply.md:45` suggests `/opsx:continue` and
  `.claude/skills/openspec-apply-change/SKILL.md:49` suggests `openspec-continue-change` — neither
  exists in the installed set (apply/archive/explore/propose/sync). Redirect both to `/opsx:propose`
  (the command that generates the missing artifacts).
- **Settings split (high — Decision 4):** Promote the shared dev plugins from the **gitignored**
  `.claude/settings.local.json` into the committed `.claude/settings.json`: `superpowers`,
  `code-review`, `frontend-design`, `playwright`, `vercel`, `prisma`, `github`, `feature-dev`,
  `code-simplifier` (joining the existing `claude-md-management` + `commit-commands`).
  `settings.local.json` then holds only genuinely machine-specific overrides. (`.gitignore:47`
  excludes `settings.local.json`; `settings.json` is committable and not ignored.)
- **Opt-in framing (med, optional):** prepend "(OpenSpec alternative; opt-in)" to the `openspec-*`
  skill descriptions so their auto-trigger is clearly secondary to Superpowers.
- **Keep as-is:** `opsx:propose` / `opsx:explore` bodies; the `openspec/specs/` hardcoded paths in
  sync/archive (self-created by the flow); the `@fission-ai/openspec` dependency (resolves on
  `npm install`; global CLI already works).

## 6. Spec-folder convention (resolves the dual-location ambiguity)

`docs/superpowers/specs/` is the **canonical, current** location for design specs (paired with
`docs/superpowers/plans/` for plans). `docs/spec/` holds **legacy** specs (the 5 files frozen since
2026-05-19) and is retained for history but is not where new specs go. CLAUDE.md §1 and
`docs/commands/openspec.md` §1 are updated to say so. No files are moved.

## 7. Validation / Acceptance Criteria

**Implementation logistics:** this touches ~8 files including a full `git-spec` rewrite — i.e.
substantial work — so per CLAUDE.md §2 it runs on a short-lived `feat/*` branch off `main`
(e.g. `feat/claude-config-cleanup`), merged with `--no-ff`, rather than direct-to-main. (The
*spec doc* commit going straight to `main` was fine — it is the multi-file implementation that
warrants a branch.) Confirm with the user before planning.

**Acceptance criteria:**

- `npm run build` passes (no source changed, but confirms nothing in config breaks tooling).
- Every path referenced by CLAUDE.md and `.claude/` either exists or is created by this change
  (no dangling `openspec/changes/` reference; `openspec/changes/` now exists).
- The `git-spec` skill (`SKILL.md` + the reference doc) contains **no** active references to a
  `develop` branch, `trk-` Jira branches, the `done:`/`in-progress:`/`pending:` commit-prefix
  system, or the feature+`stage` tree. (The historical "the `develop` branch was retired" notes in
  CLAUDE.md §2 and `openspec/COMMIT_PROCESS.md` §1 are intentional and remain.)
- `docs/commands/superpowers.md` contains no `activate_skill(` snippet.
- The committed `.claude/settings.json` enables `superpowers` (and the other shared plugins).
- The `git-spec` skill's conventions match `openspec/COMMIT_PROCESS.md`.
- `.claude/` is staged and committed (it was previously untracked).

## 8. Out of Scope (flagged for a follow-up)

`README.md` repeats the DB error ("Database: SQLite with Prisma ORM", `DATABASE_URL="file:./dev.db"`)
and spells the provider "MinitPay" (code uses **MintPay**). README is the agreed source of truth and
is **not** edited here; these are noted for a separate follow-up change.

## 9. Risks & Notes

- **Promoting plugins to committed settings (Decision 4)** enables them for every contributor on a
  fresh clone. This is intentional — they are project-shared capabilities — but it is a behavior
  change for collaborators, not just a doc fix.
- The `git-spec` rewrite is the largest single edit. Keeping the reference doc thin (Decision 5)
  reduces the number of parallel copies from three to effectively one-and-a-pointer, lowering future
  drift risk.
- This change is documentation/config only; no runtime behavior changes.
- **Marketplace assumption:** promoting `@claude-plugins-official` plugins into the committed
  `settings.json` assumes that marketplace is available to anyone who clones. If a clone lacks it
  cached, the enable entries are expected to no-op rather than error (unverified — low risk for a
  solo / primary-maintainer repo).

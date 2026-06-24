## Why

The `.claude/` config and CLAUDE.md drifted from how the repo actually works (Superpowers is the live workflow; OPSX was installed but never initialized; the `git-spec` skill described a wrong `develop`/Jira convention), and README + `.env.local.example` mis-document the database (PostgreSQL, not SQLite) and a payment provider (it is "MintPay", not "MinitPay"). This change fixes the drift and adopts a single canonical combined Superpower + OPSX + git-worktree workflow.

Full motivation, the adversarially-verified drift audit (62 findings), and all decisions live in the design spec — this proposal references it rather than restating it: `docs/superpowers/specs/2026-06-24-claude-config-cleanup-design.md`.

## What Changes

- Rewrite CLAUDE.md §1 to the combined workflow; fix the §3 DB statement to PostgreSQL; add test commands + a single README pointer.
- Reconcile the `git-spec` skill to `main` / `feat/*` / `fix/*` / Conventional Commits; shrink its reference doc to point at `openspec/COMMIT_PROCESS.md`.
- Reframe `docs/commands/openspec.md` as the OPSX stage; fix `superpowers.md` (file locations, real skill invocation).
- Tidy `openspec/COMMIT_PROCESS.md` (add `docs`/`test`/`perf` types; test verification; worktree note).
- Promote shared plugins into committed `.claude/settings.json`; drop the dangling `/opsx:continue` reference.
- Fix README + `.env.local.example` (SQLite/`file:./dev.db` → PostgreSQL; "MinitPay" → "MintPay").
- Add a root `STUB_READINESS_STATUS.md` living tracker.

## Capabilities

### New Capabilities
<!-- None. This is a documentation/config change; it introduces no product capability specs. -->

### Modified Capabilities
<!-- None. No spec-level requirement changes, so this change has NO delta specs and /opsx:sync is N/A. -->

## Impact

- Files: `CLAUDE.md`, `.claude/` (git-spec skill + `settings.json`; opsx/openspec-* refreshed by `openspec init`), `docs/commands/*`, `openspec/COMMIT_PROCESS.md`, `README.md`, `.env.local.example`, new root `STUB_READINESS_STATUS.md`.
- No application/source code changes; no runtime behavior changes; no auth/OAuth work.

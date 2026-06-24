## Context

The full design — current state, the adversarially-verified drift audit (62 findings), the combined-workflow model, and the complete change inventory — lives in `docs/superpowers/specs/2026-06-24-claude-config-cleanup-design.md`. The step-by-step plan is `docs/superpowers/plans/2026-06-24-claude-config-cleanup.md`. This OPSX design captures only the OPSX/execution-specific notes (it does not restate the spec).

## Goals / Non-Goals

**Goals:**
- Make every `.claude/` / CLAUDE.md claim true; adopt the combined Superpower + OPSX + git-worktree workflow as canonical and dogfood it on this change.
- Fix README + `.env.local.example` DB/payment drift consistently with `prisma/schema.prisma` (PostgreSQL).

**Non-Goals:**
- No application/source code changes; no auth/OAuth work; no broad README rewrite; no file moves; historical plan docs and README's "Royal Express" wording stay unchanged.

## Decisions

- Execution uses Superpowers `subagent-driven-development` as the single driver; this `tasks.md` is the shared checklist it ticks (not a second loop).
- `openspec init --tools claude` ran non-interactively → global profile, **no project `.openspec.yaml`**; OPSX is still functional (`openspec new change` works, change created under `openspec/changes/`). The dangling `/opsx:continue` reference survived init and is hand-fixed.
- Worktree-first sequencing: the `feat/claude-config-cleanup` worktree was created before init/propose so nothing lands on `main` except the one prerequisite `.claude/` baseline commit.
- No capability/spec deltas → there are no `specs/` delta files and `/opsx:sync` is **N/A** (do not manufacture deltas just to run the step).

## Risks / Trade-offs

- Promoting plugins into committed `.claude/settings.json` enables them for every contributor on a fresh clone (intended; assumes the official marketplace is available).
- File-partitioned subagents share one worktree → partition strictly by file and run a coherence pass over README + `.env.local.example` + `STUB_READINESS_STATUS.md`.

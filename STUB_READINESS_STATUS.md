# Stub / Change Readiness Status

> **Living tracker** — cell values reflect reality at commit time (not a frozen snapshot). The
> per-step **columns are status fields**; the **Required Implementation Rule** (bottom) is the
> authoritative order. This file lives at the repo **root** (never under `docs/`).

## Status

| Stub / Change | Purpose | Superpower Skill: Brainstorm | Superpower Executing Skill | Git Worktree | `/opsx:propose` | `/opsx:apply` | `/opsx:sync` | `/opsx:archive` | Current Status | TODO / Pending | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude-config-cleanup | Clean Claude/OpenSpec config, README DB docs, env example, and stub readiness tracking | Done | Applying | Done | Done | Applied | Pending | Pending | Applied — validating | Run validation, archive (`--skip-specs`; sync N/A — no deltas), merge `--no-ff`, clean worktree | Executing skill = subagent-driven-development |

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

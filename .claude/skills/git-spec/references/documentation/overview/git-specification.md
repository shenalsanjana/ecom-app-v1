# Git Specification

The canonical git conventions for this project live in `openspec/COMMIT_PROCESS.md`. The `git-spec` skill (`../../../SKILL.md`) is the quick reference.

Summary: `main` is the only integration branch (the `develop` branch was retired in 2026-05). Use lowercase, kebab-case `feat/*` / `fix/*` branches cut from `main`; small fixes may commit directly to `main`. Commit with Conventional Commits (`feat`/`fix`/`docs`/`refactor`/`chore`/`test`/`perf` with a scope). Implement substantial work in a dedicated git worktree; open PRs into `main` and merge `--no-ff`. There is no Jira `trk-*` branch convention and no feature/`stage` tree.

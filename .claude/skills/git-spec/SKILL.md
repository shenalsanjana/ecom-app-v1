---
name: git-spec
description: Use when creating a git branch, writing a commit message, or opening a PR in this repo. Branches are `feat/*` or `fix/*` cut from `main` (small fixes may commit directly to `main`); there is no `develop` branch. Commits follow Conventional Commits (`feat(scope):`, `fix(scope):`, `docs(...)`, `refactor(...)`, `chore(...)`, `test(...)`, `perf(...)`). Substantial work is implemented in a dedicated git worktree.
---

# Git Spec

## Overview

Project git conventions, aligned with `openspec/COMMIT_PROCESS.md` (the single source of truth). `main` is the only integration/release branch; the `develop` branch was retired in 2026-05. Substantial work happens on short-lived `feat/*` or `fix/*` branches cut from `main`, implemented in a dedicated git worktree, and merged back with `--no-ff`. Small fixes may commit directly to `main`.

## When to Use

- Cutting a `feat/*` or `fix/*` branch from `main`
- Deciding whether a change is small enough to commit directly to `main`
- Writing a Conventional Commit message
- Opening a PR into `main`

## Quick Reference

### Branch naming

| Rule | Value |
| --- | --- |
| Branch case | lowercase, kebab-case |
| Integration branch | `main` |
| Feature branch | `feat/<topic>` (e.g. `feat/admin-settings`) |
| Fix branch | `fix/<topic>` (e.g. `fix/checkout-city-cap`) |
| Small fix | may commit directly to `main` |
| PR target | `main` |
| Merge style | `--no-ff` |

### Commit messages (Conventional Commits)

| Type | Use for |
| --- | --- |
| `feat(scope):` | New feature |
| `fix(scope):` | Bug fix |
| `docs(...):` | Documentation and spec/plan changes |
| `refactor(...):` | Code change that neither fixes a bug nor adds a feature |
| `chore(...):` | Maintenance, merges, tooling |
| `test(...):` | Adding or updating tests |
| `perf(...):` | Performance improvement |

- Subject is concise but descriptive; include the "why" in the body when the "what" isn't obvious.
- Verify with `npm run build` (and `npm run test`) before committing.

### Examples (real commits from history)

```
feat(dispatch): admin tracking editor + DISPATCHED-aware order actions
fix(checkout): show full city catalogue in combobox (remove 80-item cap)
docs(config): rewrite CLAUDE.md lifecycle to combined workflow
```

## Workflow

1. Cut a `feat/*` or `fix/*` branch from `main`; implement substantial work in a dedicated git worktree (see `superpowers:using-git-worktrees`).
2. Commit with Conventional Commits.
3. `npm run build` (+ `npm run test`) to verify.
4. Open a PR into `main`; merge with `--no-ff`.
5. Clean up the worktree after merge.

## Full Spec

See `openspec/COMMIT_PROCESS.md` — the single source of truth for commit, branch, and integration rules. This skill is the quick reference; that file governs.

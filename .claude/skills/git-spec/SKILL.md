---
name: git-spec
description: Use when creating a git branch, writing a commit message, or opening a PR in this workflow — defines lowercase Jira-derived branch names, typed commit prefixes (done/fix/refactor/cleanup/in-progress/pending), feature-with-stage branch structure, and uppercase PR title format `<SOURCE-BRANCH>: <Change Topic>`.
---

# Git Spec

## Overview

Project git conventions: branch names and commit messages are lowercase and derived from Jira ticket numbers. Tasks get a single branch; user stories get a feature branch with a `stage` integration branch and sub-task branches underneath.

## When to Use

- Creating a new branch from a Jira ticket
- Writing a commit message
- Deciding whether a ticket needs a single branch or a feature + stage structure
- Opening a PR (target branch depends on structure)

## Quick Reference

### Naming

| Rule | Value |
| --- | --- |
| Branch case | lowercase |
| Commit message case | lowercase |
| PR title (branch portion) case | UPPERCASE |
| Branch name source | Jira ticket number (e.g., `trk-5`) |
| Task ticket → | single branch |
| User Story ticket → | feature branch + `stage` |
| Epic ticket → | no branch |

### Commit prefixes

| Prefix | Meaning |
| --- | --- |
| `done` | Implementation complete |
| `fix` | Bug resolved |
| `refactor` | Code refactored |
| `cleanup` | Cleanup or formatting |
| `in-progress` | Partial work being committed |
| `pending` | Remaining task, not yet started |

### Commit header by branch type

The commit header is derived from the branch name by replacing `/` with ` > ` (space-greater-than-space).

| Branch name | Commit header |
| --- | --- |
| `trk-3` | `trk-3:` |
| `trk-40/stage` | `trk-40 > stage:` |
| `trk-40/trk-41` | `trk-40 > trk-41:` |

Schematic:

| Branch type | Branch name | Header |
| --- | --- | --- |
| Single task | `<branch-name>` | `<branch-name>:` |
| Feature stage | `<parent-branch>/stage` | `<parent-branch> > stage:` |
| Sub-task under feature | `<parent-branch>/<sub-branch>` | `<parent-branch> > <sub-branch>:` |

### Indentation

- `- <prefix>:` lines → 2 spaces from header
- `- note:` lines → 4 spaces (nested under their prefix line)

### PR title

Format: `<SOURCE-BRANCH>: <Change Topic>`

PR titles use **UPPERCASE** for the branch portion (Jira IDs and `STAGE`) — distinct from the lowercase commit headers. The branch portion is derived from the source branch name with `/` replaced by ` > `.

| Source branch | PR title |
| --- | --- |
| `trk-3` | `TRK-3: <Change Topic>` |
| `trk-40/trk-41` | `TRK-40 > TRK-41: <Change Topic>` |
| `trk-40/stage` | `TRK-40 > STAGE: <Change Topic>` |

Schematic:

| Branch type | Source branch | PR title |
| --- | --- | --- |
| Single task | `<branch-name>` | `<BRANCH-NAME>: <Change Topic>` |
| Feature stage | `<parent-branch>/stage` | `<PARENT-BRANCH> > STAGE: <Change Topic>` |
| Sub-task under feature | `<parent-branch>/<sub-branch>` | `<PARENT-BRANCH> > <SUB-BRANCH>: <Change Topic>` |

### PR target

| Source branch | Target branch |
| --- | --- |
| `trk-3` (single task) | `develop` |
| `trk-40/trk-41` (sub-task) | `trk-40/stage` |
| `trk-40/stage` (feature stage) | `develop` |

## Example

Single branch `trk-3`:

```
trk-3:
  - done: added OIDC RP-initiated logout route (/api/logout) — clears NextAuth cookies and redirects to Zitadel end_session_endpoint
  - done: made allowedDevOrigins configurable via ALLOWED_DEV_ORIGINS env var in next.config.mjs (was hardcoded IP)
  - done: revised README — removed redundant Quick Start duplication, added bin/ dev scripts section, fixed docker compose v2 syntax, completed docs/ directory tree, corrected production Makefile path
    - note: production Makefile path was previously pointing to the wrong directory
```

Sub-task branch `trk-5/trk-6`:

```
trk-5 > trk-6:
  - done: built login form layout with email and password fields
  - in-progress: wiring up form validation
  - pending: integrate with authentication server
```

Feature stage branch `trk-5/stage`:

```
trk-5 > stage:
  - cleanup: removed unused imports across auth modules
  - refactor: extracted shared auth helpers into lib/auth
```

PR titles for the branches above:

```
TRK-3: Add OIDC RP-initiated logout
TRK-5 > TRK-6: Build login form layout
TRK-5 > STAGE: Complete user authentication feature
```

## Feature branch workflow

Sub-task branches are nested under the parent feature using `/`:

```
develop
 └── trk-5/stage      ← integration branch, created from develop
      ├── trk-5/trk-6 ← created from trk-5/stage
      ├── trk-5/trk-7 ← created from trk-5/stage
      └── trk-5/trk-8 ← created from trk-5/stage
```

1. `<parent>/stage` is cut from `develop` — source of truth for the feature.
2. Each sub-task branch is cut from `<parent>/stage`.
3. Completed sub-tasks PR into `<parent>/stage`.
4. When the feature is done, `<parent>/stage` merges into `develop`.

## Full Spec

See `references/documentation/overview/git-specification.md` for the complete specification with all examples and edge cases.

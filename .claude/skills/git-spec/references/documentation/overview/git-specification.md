# Git Specification

This document defines the Git conventions for branch naming, commit messages, and branch structure used across our projects.

## General Conventions

- Git branch names are always **lowercase**.
- Git commit messages are always **lowercase**.
- Git branch names are based on the corresponding **Jira ticket number**.

## Branch Naming

Branch names are derived directly from Jira ticket numbers (e.g., `trk-5`). A **User Story** ticket maps to a **feature branch**, while a **Task** ticket maps to a **single branch**.

> **Note:** Feature branches are not created from Epic tickets.

### Example: User Story and its Sub-tasks

```
TRK-5  Implement user authentication
 ├── TRK-6  UI design for the user login page
 ├── TRK-7  Implement authentication server
 └── TRK-8  Backend APIs to fetch user details & REST API middleware
```

## Branch Structure

### Single Branch Structure

Used for standalone **Task** tickets. A single branch is created directly from `develop`:

```
trk-4
```

### Feature Branch Structure

Used for **User Story** tickets that contain multiple sub-tasks. The feature uses a `stage` branch as the integration branch, and each sub-task branch is nested under the feature ticket using a `/` separator:

```
develop
 └── trk-5/stage   ← integration branch, created from develop
      ├── trk-5/trk-6   ← created from trk-5/stage
      ├── trk-5/trk-7   ← created from trk-5/stage
      └── trk-5/trk-8   ← created from trk-5/stage
```

**Workflow:**

1. The `trk-5/stage` branch is created from `develop` and represents the source of truth for the `trk-5` feature.
2. Each sub-task branch (`trk-5/trk-6`, `trk-5/trk-7`, `trk-5/trk-8`) is created from `trk-5/stage`.
3. When a sub-task is completed, a PR is raised against `trk-5/stage`.
4. Once all sub-tasks are merged into `trk-5/stage` and the feature is complete, `trk-5/stage` is merged into `develop`.

## Commit Message Format

Commit messages are grouped under the branch name, with each line prefixed by a **type** that describes the nature of the change.

**Header rule:** the commit header is the branch name with `/` replaced by ` > ` (space-greater-than-space). For example:

| Branch name | Commit header |
| ---- | ---- |
| `trk-3` | `trk-3:` |
| `trk-40/stage` | `trk-40 > stage:` |
| `trk-40/trk-41` | `trk-40 > trk-41:` |

### Commit Prefix Types

| Prefix        | Meaning                                              |
| ------------- | ---------------------------------------------------- |
| `done`        | An implementation is complete.                       |
| `fix`         | A bug has been resolved.                             |
| `refactor`    | Code has been refactored.                            |
| `cleanup`     | Code cleanup or formatting.                          |
| `in-progress` | Partially completed work that is being committed.   |
| `pending`     | A remaining task or fix that has not been started.   |

### Format

Indentation uses **2 spaces per level**:

- `- <prefix>:` lines are indented **2 spaces** from the header.
- `- note:` lines are indented **4 spaces** (one additional level of 2 spaces) from the header, nesting them under their parent prefix line.

The header line varies depending on which branch the commit is being made against.

#### 1. Single branch

When committing to a standalone task branch, the header is just the branch name:

```
<branch-name>:
  - <prefix>: task description
  - <prefix>: task description
  - <prefix>: task description
    - note: special description
```

#### 2. Feature branch (sub-task)

When committing to a sub-task branch under a feature, the header references both the parent feature branch and the sub-task branch:

```
<parent-branch> > <sub-branch>:
  - <prefix>: task description
  - <prefix>: task description
  - <prefix>: task description
    - note: special description
```

#### 3. Feature branch stage

When committing directly to the feature's `stage` branch, the header references the parent feature branch and `stage`:

```
<parent-branch> > stage:
  - <prefix>: task description
  - <prefix>: task description
  - <prefix>: task description
    - note: special description
```

### Example

Branch: `trk-3` (single branch)

```
trk-3:
  - done: added OIDC RP-initiated logout route (/api/logout) — clears NextAuth cookies and redirects to Zitadel end_session_endpoint
  - done: made allowedDevOrigins configurable via ALLOWED_DEV_ORIGINS env var in next.config.mjs (was hardcoded IP)
  - done: revised README — removed redundant Quick Start duplication, added bin/ dev scripts section, fixed docker compose v2 syntax, completed docs/ directory tree, corrected production Makefile path
    - note: production Makefile path was previously pointing to the wrong directory
```

Branch: `trk-5/trk-6` (sub-task under feature `trk-5`)

```
trk-5 > trk-6:
  - done: built login form layout with email and password fields
  - in-progress: wiring up form validation
  - pending: integrate with authentication server
```

Branch: `trk-5/stage` (feature stage branch)

```
trk-5 > stage:
  - cleanup: removed unused imports across auth modules
  - refactor: extracted shared auth helpers into lib/auth
```

## Pull Request Title Format

PR titles follow the format `<SOURCE-BRANCH>: <Change Topic>`.

Two rules apply to the source-branch portion:

1. `/` is replaced by ` > ` (space-greater-than-space) — same substitution as the commit header.
2. The branch text is **UPPERCASE** — Jira IDs are uppercased and `stage` becomes `STAGE`. This differs from commit headers, which stay lowercase.

`<Change Topic>` is a short, human-readable description of the change.

| Source branch | PR title |
| --- | --- |
| `trk-3` | `TRK-3: <Change Topic>` |
| `trk-40/trk-41` | `TRK-40 > TRK-41: <Change Topic>` |
| `trk-40/stage` | `TRK-40 > STAGE: <Change Topic>` |

### 1. Single branch PR

When opening a PR from a standalone task branch into `develop`:

```
<BRANCH-NAME>: <Change Topic>
```

Example — PR from `trk-3` → `develop`:

```
TRK-3: Add OIDC RP-initiated logout
```

### 2. Sub-task PR (under feature)

When opening a PR from a sub-task branch into its feature `stage` branch:

```
<PARENT-BRANCH> > <SUB-BRANCH>: <Change Topic>
```

Example — PR from `trk-40/trk-41` → `trk-40/stage`:

```
TRK-40 > TRK-41: Build login form layout
```

### 3. Feature stage PR

When opening a PR from a feature's `stage` branch into `develop`:

```
<PARENT-BRANCH> > STAGE: <Change Topic>
```

Example — PR from `trk-40/stage` → `develop`:

```
TRK-40 > STAGE: Complete user authentication feature
```

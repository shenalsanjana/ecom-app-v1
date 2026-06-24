# OpenSpec / OPSX (CLI) — the change-artifacts stage of the combined workflow

OpenSpec is the **propose → apply → sync → archive** stage of the project's combined workflow. It is
not the whole workflow: discovery and design happen first in Superpowers `brainstorming` (**never**
`/opsx:explore`), and the implementation plan is written with Superpowers `writing-plans`. See
`superpowers.md` and CLAUDE.md §1 for the full lifecycle.

New design specs live in `docs/superpowers/specs/`; plans live in `docs/superpowers/plans/`. The
legacy `docs/spec/` folder is frozen and retained for history only.

## 0. One-time setup

```
openspec init --tools claude
```

Initializes OpenSpec so the CLI commands below resolve a planning home. `openspec list` /
`openspec status` confirm it is working.

## 1. Propose (`/opsx:propose`)

Creates the change and its artifacts under `openspec/changes/<change-name>/`:

```
openspec new change <change-name>
```

Then create `proposal.md` (what & why), `design.md` (how), and `tasks.md` (implementation steps).
`proposal.md` / `design.md` should **reference** the Superpowers design spec rather than restate it;
`tasks.md` carries the executable checklist. Check readiness with
`openspec status --change <change-name>`.

## 2. Apply (`/opsx:apply`)

Implement the `tasks.md` items **inside the dedicated git worktree**, ticking each checkbox (`- [ ]`
→ `- [x]`) as it lands.

## 3. Sync (`/opsx:sync`)

Sync delta specs into the main specs — only when the change actually has spec deltas. **Doc/config-only
changes have no deltas; skip sync.**

## 4. Archive (`/opsx:archive`)

After implementation and validation:

```
openspec archive <change-name>                # changes that carry spec deltas
openspec archive <change-name> --skip-specs   # doc-only / tooling changes (no deltas)
```

A human-readable narrative of major changes is kept in `openspec/archive/YYYY-MM-DD-<change-name>.md`.

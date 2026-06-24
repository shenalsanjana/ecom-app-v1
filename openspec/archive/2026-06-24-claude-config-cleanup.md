# 2026-06-24 — claude-config-cleanup

Reconciled the `.claude/` config and CLAUDE.md with how the repo actually works, fixed README +
`.env.local.example` DB/payment drift, and adopted the canonical **combined Superpower + OPSX +
git-worktree workflow** (dogfooded on this change).

## Highlights

- **CLAUDE.md §1** rewritten to the combined workflow (brainstorm → propose → executing skill →
  worktree → apply → validate → sync → archive → `--no-ff` merge); database corrected to PostgreSQL.
- **`git-spec` skill** reconciled to `main` / `feat/*` / `fix/*` / Conventional Commits (it had
  described a `develop` / Jira `trk-*` / `done:`-`in-progress:` convention); its reference doc now
  points at `openspec/COMMIT_PROCESS.md` as the single source of truth.
- **`docs/commands/openspec.md`** reframed as the OPSX stage; **`superpowers.md`** fixed (file
  locations, real Skill-tool invocation, discovery via `brainstorming` not `/opsx:explore`).
- **`openspec/COMMIT_PROCESS.md`** gained `docs`/`test`/`perf` commit types + test verification +
  a git-worktree note.
- Shared dev plugins promoted into the committed **`.claude/settings.json`**; the dangling
  `/opsx:continue` reference fixed.
- **README + `.env.local.example`**: SQLite / `file:./dev.db` → PostgreSQL; "MinitPay" → "MintPay".
- Added the root **`STUB_READINESS_STATUS.md`** living tracker.

## References

- Design spec: `docs/superpowers/specs/2026-06-24-claude-config-cleanup-design.md`
- Plan: `docs/superpowers/plans/2026-06-24-claude-config-cleanup.md`
- OPSX change (CLI-archived): `openspec/changes/archive/2026-06-24-claude-config-cleanup/`
- Doc-only change → no spec deltas → `/opsx:sync` N/A; archived with `openspec archive --skip-specs`.

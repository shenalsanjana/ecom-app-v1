# Superpower Skills (Agent Commands)

The following skills can be activated to provide expert guidance and specialized workflows.

## Process Skills
- **`brainstorming`**: Use before any creative work (features, components).
- **`writing-plans`**: Use after a spec is ready to create a step-by-step implementation plan.
- **`executing-plans`**: Use when you have a written plan to execute.
- **`systematic-debugging`**: Use when encountering any bug or unexpected behavior.
- **`test-driven-development`**: Use to write tests before implementation.

## Verification Skills
- **`verification-before-completion`**: Use before claiming any task is finished.
- **`requesting-code-review`**: Use when major work is ready for feedback.
- **`receiving-code-review`**: Use when implementing feedback.

## Workflow Skills
- **`using-git-worktrees`**: Use for isolated feature development.
- **`dispatching-parallel-agents`**: Use for independent concurrent tasks.
- **`subagent-driven-development`**: Use for executing complex plans with agents.
- **`finishing-a-development-branch`**: Use when work is done to decide on merge strategy.

## Invoking a skill

Invoke a skill via the Skill tool, or the `/superpowers:<name>` slash command — e.g.
`/superpowers:systematic-debugging`. (There is no `activate_skill(...)` function.)

## File locations

- Design specs: `docs/superpowers/specs/<YYYY-MM-DD>-<change-name>-design.md` (from `brainstorming`)
- Implementation plans: `docs/superpowers/plans/<YYYY-MM-DD>-<change-name>.md` (from `writing-plans`)

## Where this fits

These Superpowers skills are the discovery, planning, and execution layers of the project's combined
workflow: `brainstorming` (discovery — **never** `/opsx:explore`) → `writing-plans` → `/opsx:propose`
→ an executing skill (`subagent-driven-development` / `executing-plans`) → git worktree →
`/opsx:apply` → `/opsx:sync` → `/opsx:archive`. See CLAUDE.md §1 and `openspec.md`.

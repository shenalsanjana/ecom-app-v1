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

## Usage
Activate a skill by name:
```bash
# Example
activate_skill(name="systematic-debugging")
```

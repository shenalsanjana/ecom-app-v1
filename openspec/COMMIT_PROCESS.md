# Commit Process

To maintain a clean and traceable history, all changes must follow this process:

## 1. Branching
- Substantial work starts from `main` on a `feat/feature-name` or `fix/bug-description` branch; small fixes can go directly to `main`.
- The `develop` branch was retired in 2026-05; older commits referencing "merge develop into main" predate this change.

## 2. Commit Messages
- Use conventional commits:
  - `feat(...)`: New features
  - `fix(...)`: Bug fixes
  - `chore(...)`: Maintenance, merges, or documentation
  - `refactor(...)`: Code changes that neither fix a bug nor add a feature
- Messages should be concise but descriptive. Include "why" if the "what" isn't obvious.

## 3. Verification
- Before committing, run `npm run build` to ensure no regressions.
- Ensure all TypeScript errors are resolved.

## 4. Integration
- Merge feature branches into `main` using `--no-ff` to preserve history.
- `main` is the production / release branch.

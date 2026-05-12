# Commit Process

To maintain a clean and traceable history, all changes must follow this process:

## 1. Branching
- All features and bugfixes must start from the `develop` branch.
- Use descriptive branch names: `feat/feature-name` or `fix/bug-description`.

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
- Merge feature branches into `develop` using `--no-ff` to preserve history.
- Periodically merge `develop` into `main` for production releases.

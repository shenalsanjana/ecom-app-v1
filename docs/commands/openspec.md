# OpenSpec Commands & Workflow

The OpenSpec workflow ensures every change is specified, planned, and archived.

## 1. Specification (docs/spec)
When starting a new feature or bugfix, create a specification file:
```bash
# Example
touch docs/spec/new-feature.md
```
Content should include:
- Goal
- User Impact
- Technical Approach
- Requirements Checklist

## 2. Implementation Planning (openspec/changes)
Once the spec is approved, create an implementation folder and plan:
```bash
# Example
mkdir openspec/changes/new-feature
touch openspec/changes/new-feature/plan.md
```
The `plan.md` should contain:
- Step-by-step implementation tasks
- Testing strategy for each step
- Rollback plan

## 3. Archiving (openspec/archive)
After the change is merged into `main`, archive the implementation:
```bash
# Example
# Move the finalized implementation details to:
# openspec/archive/YYYY-MM-DD-change-name.md
# Then delete the folder in openspec/changes/
```

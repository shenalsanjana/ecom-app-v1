# Dressing Bear - Engineering Standards

This file defines the foundational architecture and workflows for the Dressing Bear project.

## 1. Lifecycle: Spec -> Plan -> Implement
- **Phase 1: Brainstorming & Specification:** When a new feature, bug, or change is conceived, write a specification in `docs/spec/<change-name>.md`. This defines "what" we are building and "why" and do planing on `docs/superpowers/plans/<date-change-name.md>`with superpower planing skill.
- **Phase 2: Execution:** Implement the plan on a feature branch from `develop`.
- **Phase 3: Archiving:** Once merged, move the implementation details to `openspec/archive/` and remove the active plan folder from `openspec/changes/`.

## 2. Development Workflow
- **Branching:** Work exclusively from the `develop` branch. Never commit directly to `main`.
- **Commit Process:** Follow the rules in `openspec/COMMIT_PROCESS.md`.
- **Validation:** Every change must be verified with `npm run build` before merge.

## 3. Architecture Guidelines
- **Framework:** Next.js 16 (App Router).
- **Server vs. Client:**
    - Favor Server Components for SEO and performance.
    - Client Components must be kept small and at the leaves of the component tree.
    - **Constraint:** Never render an `async` Server Component directly inside a `"use client"` component.
- **Auth:** NextAuth.js v5. Always ensure `secret` and `trustHost` are configured. Use standard `redirectTo` in Server Actions.
- **Database:** Prisma with PostgreSQL (production) or SQLite (local). Use `nodejs` runtime for API routes that interact with Prisma.

## 4. Documentation
- **CLAUDE.md:** This file. Foundational repo guidance.
- **README.md:** Project overview and setup instructions.
- **docs/commands/:** Quick reference for OpenSpec and Superpower workflows.
- **openspec/archive/:** History of major implementations and brainstormed ideas.
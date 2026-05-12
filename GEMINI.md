# Dressing Bear - Engineering Standards

This file defines the foundational architecture and workflows for the Dressing Bear project.

## 1. Specification Workflow
- **Spec First:** All new features or major architectural changes must have a specification written before implementation.
- **Location:** Specs are stored in `docs/spec/` as `.md` files.
- **Content:** Specs should define the goal, user impact, technical approach, and a checklist of requirements.

## 2. Development Workflow
- **Branching:** Work exclusively from the `develop` branch. Never commit directly to `main`.
- **Commit Process:** Follow the rules in `openspec/COMMIT_PROCESS.md`.
- **Archiving:** After a significant set of changes is completed and merged, document the implementation in `openspec/archive/`.

## 3. Architecture Guidelines
- **Framework:** Next.js 16 (App Router).
- **Server vs. Client:** 
  - Favor Server Components for SEO and performance.
  - Client Components must be kept small and at the leaves of the component tree.
  - **Constraint:** Never render an `async` Server Component directly inside a `"use client"` component.
- **Auth:** NextAuth.js v5. Always ensure `secret` and `trustHost` are configured. Use standard `redirectTo` in Server Actions.
- **Database:** Prisma with PostgreSQL (production) or SQLite (local). Use `nodejs` runtime for API routes that interact with Prisma.

## 4. Documentation
- **GEMINI.md:** This file. Foundational repo guidance.
- **README.md:** Project overview and setup instructions.
- **openspec/archive/:** History of major implementations and brainstormed ideas.

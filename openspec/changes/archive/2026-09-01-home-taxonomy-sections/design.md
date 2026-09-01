## Context

The authoritative design for this change is `docs/superpowers/specs/2026-09-01-home-taxonomy-sections-design.md`, and the task-by-task implementation plan is `docs/superpowers/plans/2026-09-01-home-taxonomy-sections.md`. This document records the decisions rather than restating them; read the spec for the full argument.

Current state: the Department → Design taxonomy shipped at `8ed2952` and the main specs were reconciled to it at `e406c51`, but the home page still renders `category-strip.tsx` — every design listed as a "category", linked flat. The foundation deliberately left two derived predicates in `app/_lib/taxonomy.ts` (`showsNavDropdown`, `showsInDesignSection`); the first gained its only caller when the category index was fixed at `767fc99`, and the second still has none.

Two constraints shape the implementation more than anything else. `vitest.config.ts` collects only `.test.ts`, so tests contain no JSX and inspect returned element trees directly; and a tree walk does not descend into child components, so href assertions must live in each component's own test while the page test asserts composition.

## Goals / Non-Goals

**Goals:**
- Home page renders departments under "Shop by category" and a department-grouped "Shop by design" section
- Every taxonomy link the home page and footer emit is canonical and nested — no reliance on the 308
- Both sections behave sensibly on production, which has four departments but two designs
- `showsInDesignSection` gains the caller it was written for

**Non-Goals:**
- Taxonomy follow-ups C (header mega-menu), D (browse filter tree), E (PDP and card breadcrumbs)
- The source canvas's 3.8s tile auto-rotation
- Any admin UI for `tileName` / `note` / `subName`
- Migrating the `/categories` index to the shared tile component

## Decisions

**Layout comes from repo patterns, not the canvas.** `Dressing Bear Storefront.dc.html` is not in this repository, so any claim of fidelity to it would be invention. `Section`, `SectionHeader`, `Eyebrow` and the existing `/categories` department tiles already establish the vocabulary. *Alternative considered:* reconstructing from the taxonomy spec's one-line §9 description — rejected as inventing detail while claiming a source.

**No carousel.** The canvas auto-rotates tiles every 3.8s. Taxonomy spec §9 flagged that this needs a reduced-motion design keeping every slide reachable, not merely frozen — the failure mode fixed for the marquee at `39ef139`. A static grid has no such mode and nothing about browsing requires motion. *Alternative considered:* building the rotation with a conforming reduced-motion variant — rejected as cost with no user benefit.

**One read, passed down.** `app/page.tsx` becomes async and calls the already-cached `getDepartments()` once, passing rows to two pure synchronous components. This keeps `next/cache` out of component tests. *Alternatives considered:* a dedicated `getHomeTaxonomy()` read (nothing left to shape — `DepartmentView` already carries every field needed) and per-section self-fetching (two cache reads, and mocking dragged into every component test).

**Sections self-hide rather than render sparse.** Cards require ≥2 linked departments; the grid requires ≥1 qualifying department. On production this hides the cards and shows one Women group of two — preserving roughly what the page shows today, with correct headings and nested links, and healing on its own as designs are added. *Alternative considered:* always rendering (a one-tile four-up grid reads as a bug) and rendering all four departments regardless (three tiles linking to indexable "Nothing here yet." pages — the exact defect closed at `767fc99`).

**Tints render from stored rows.** `hex` is what the seed writes and what an operator would change; `tintForSlug` is a build-time map. The map remains the seed's source and the contrast gate's input.

**Groups are labelled by department *and* sub-category.** Men and Women both seed `subName: "Oversized Graphic T-Shirts"`, so sub-category alone does not identify a group. Groups also render `<h3>` rather than reusing `SectionHeader`, which hardcodes `<h2>` and would nest a second `<h2>` under the section's own.

## Risks / Trade-offs

- **The home page loses a visible section on production until the catalog grows** → accepted deliberately. The design grid still renders the two live designs, so the page does not lose content; only the four-up department grid waits. Both thresholds are module constants with tests pinning their values, so the behaviour is discoverable rather than mysterious.
- **`showsInDesignSection` excludes Plain T-Shirts and Accessories**, since neither seeds a `subName` → this is the predicate's existing contract, now given a caller and a test. If those departments should appear later, the fix is a `subName` on the row, not a code change.
- **Neither `npm run build` nor `npm run test:e2e` can run on the dev box** — `DATABASE_URL` points at the docker-compose host `postgres` → both fall to CI or the VPS, as already recorded for the foundation in `openspec/archive/2026-08-30-storefront-taxonomy-foundation.md`. Unit tests, type check and the contrast gate all run locally and cover the logic this change adds.
- **The footer change widens the blast radius beyond the home page**, since the footer renders everywhere → mitigated by a test asserting the footer emits no flat design link, and by the change being a link-construction swap with no layout edit.

## Migration Plan

None. No schema change, no migration, no new environment variable, no data backfill. The change is deploy-and-done; rollback is a revert.

## Open Questions

None. The three decisions that were open during brainstorming — visual source of truth, empty-state behaviour, and section placement — were settled with the product owner before the spec was written.

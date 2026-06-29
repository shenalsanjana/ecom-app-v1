## Context

Categories (`Category { slug @id, name, image }`) could only be created inline from the product form. The slug is the PK, the product FK target, and part of `/categories/{slug}` URLs. The product→category FK is `ON DELETE RESTRICT ON UPDATE CASCADE`. Full design rationale: `docs/superpowers/specs/2026-06-29-admin-category-management-design.md`.

## Goals / Non-Goals

**Goals:**
- A real admin CRUD surface for categories.
- Safe renames that preserve product references and old links.
- Safe deletes that never strand products.

**Non-Goals:**
- Editing a slug directly (slug is always derived from the name).
- Category hierarchy/nesting.
- Bulk operations.

## Decisions

- **Rename via the existing `ON UPDATE CASCADE` FK.** `updateCategory` branches on the *slug*, not the name: if `slugify(name) === currentSlug` it updates name/image only; otherwise it resolves a unique new slug (predicate excludes the current category) and, in a transaction, updates the category slug (cascade rewrites products and existing history rows), upserts a `CategorySlugHistory` row, and deletes any `oldSlug === newSlug` self-loop row. Branching on the slug avoids corrupting the slug on cosmetic edits.
- **`CategorySlugHistory` for redirects.** New table `{ oldSlug @id, currentSlug → Category.slug (Cascade/Cascade) }`. Cascade-update keeps redirect chains flat (A→B→C collapses to two rows pointing at C); cascade-delete cleans history when a category is deleted. The storefront route looks up a retired slug and `permanentRedirect` (308) to the current slug.
- **Safe-delete via pre-count + FK backstop.** `deleteCategory` counts products and refuses with a friendly message if `> 0`; the DB `RESTRICT` is the backstop.
- **Consolidate actions.** `createCategory` moves into `app/admin/categories/actions.ts`; the single importer (`category-select.tsx`) is repointed so inline create still works.
- **Empty-slug guard.** Names that slugify to empty are rejected in create and update (and the mirror guard was added to product create).

## Risks / Trade-offs

- [Slug-history table is extra surface] → Small and self-cleaning via cascade; the cost of keeping old links alive (chosen over accepting 404s).
- [A rename writes across all products in the category] → Fine at this catalog's scale; renames are rare admin actions.
- [TOCTOU on slug uniqueness] → Degrades gracefully: the DB unique PK makes a racing duplicate throw, caught and returned as a generic error.

## Migration Plan

- Migration `20260629120000_add_category_slug_history` was hand-authored to match the existing init migration's SQL style (no DB available in the dev environment to run `prisma migrate dev`). Apply with `npx prisma migrate deploy` against the real database before use. Rollback: drop the `CategorySlugHistory` table; no existing data is modified by the migration.

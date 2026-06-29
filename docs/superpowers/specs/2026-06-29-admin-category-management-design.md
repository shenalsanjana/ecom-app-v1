# Admin Category Management (`/admin/categories`) — Design Spec

- **Date:** 2026-06-29
- **Change name:** admin-category-management
- **Status:** Approved design, pending implementation plan

## Goal

A full CRUD admin page for product categories — **list, create, edit (name +
image, slug regenerated on rename), and safe-delete** — plus old-slug redirects
so renames don't break existing links.

## Background / Current State

- `Category { slug @id, name, image, products[] }`
  ([prisma/schema.prisma](../../../prisma/schema.prisma)). `slug` is the primary
  key, the foreign key products point to (`Product.categorySlug`), and part of
  storefront URLs (`/categories/{slug}`).
- The FK is `ON DELETE RESTRICT ON UPDATE CASCADE`
  ([migration](../../../prisma/migrations/20260507112953_init/migration.sql) line
  191). **`ON UPDATE CASCADE` is load-bearing for this design** — updating
  `Category.slug` automatically propagates the new value to every referencing
  `Product.categorySlug` row.
- No admin categories UI exists today. Categories can only be **created** inline
  from the product form ([category-select.tsx](../../../app/_components/admin/products/category-select.tsx)
  → `createCategory` in [app/admin/products/actions.ts](../../../app/admin/products/actions.ts)).
  There is no edit, delete, or list/management page.
- Admin conventions: Server Actions with `requireAdmin()`, Zod validation,
  `ActionResult` return shape, a `revalidate()` helper
  (`revalidatePath` + `revalidateTag("catalog", "max")`), `slugify` / `uniqueSlug`
  helpers in [app/_lib/admin-products.ts](../../../app/_lib/admin-products.ts).
- The admin chrome already loads **`sonner` toasts**
  ([app/admin/layout.tsx](../../../app/admin/layout.tsx) line 19), so success/error
  can be surfaced with `toast` instead of `alert()`.

## Decisions

1. **Full CRUD** management page at `/admin/categories`.
2. **Slug follows the name** on rename (user choice, overriding the
   slug-immutable recommendation). Propagation to products is handled by the
   existing `ON UPDATE CASCADE` FK.
3. **Old slugs redirect to new** (user choice, overriding accept-the-404). A
   small `CategorySlugHistory` table records the mapping; the storefront category
   route redirects old → current.
4. **Safe-delete** — a category can only be deleted when no products reference
   it (DB already enforces `RESTRICT`; the action pre-checks for a friendly
   message).

## Design

### 1. Routes (mirror the products admin)

- `app/admin/categories/page.tsx` — server component; lists all categories with
  **product counts**, a "New category" link, and per-row Edit/Delete controls.
- `app/admin/categories/new/page.tsx` — create form.
- `app/admin/categories/[slug]/edit/page.tsx` — edit form (name + image).
- Shared `CategoryForm` client component (reuse existing `ImageInput`).
- `CategoriesTable` client component for the list + delete action.
- Add a **"Categories"** link to
  [AdminSidebar](../../../app/_components/admin/admin-sidebar.tsx).

### 2. Server Actions — new `app/admin/categories/actions.ts`

Consolidate category actions here. **Move `createCategory` out of
`products/actions.ts`**; before doing so, `grep` for every importer (not just
`category-select.tsx`) and update each import. Each action uses `requireAdmin()`,
Zod validation, `ActionResult`, and the `revalidate()` pattern.

- **`createCategory(name, image)`** — unchanged behavior; slug from
  `uniqueSlug(slugify(name), …)`.

- **`updateCategory(currentSlug, { name, image })`** — the careful one:
  1. Compute `candidateSlug = slugify(name)`.
  2. **Branch on the SLUG, not the name.** If `candidateSlug === currentSlug`,
     this is a name/image-only update: `prisma.category.update({ where: { slug:
     currentSlug }, data: { name, image } })`. **No new slug, no history row.**
     (This is what makes cosmetic edits like `"cats" → "Cats"` or
     `"T-Shirts" → "T Shirts"` safe — same slug, no corruption.)
  3. If `candidateSlug !== currentSlug`, resolve a unique `newSlug` with a
     predicate that **excludes the current category**:
     `uniqueSlug(candidateSlug, async (s) => (await prisma.category.findFirst({ where: { slug: s, NOT: { slug: currentSlug } } })) !== null)`.
     Then in a `$transaction`:
     - `prisma.category.update({ where: { slug: currentSlug }, data: { slug: newSlug, name, image } })`. The `ON UPDATE CASCADE` FK propagates `newSlug`
       to every product **and** rewrites any existing
       `CategorySlugHistory.currentSlug` rows that pointed at `currentSlug` — this
       is what keeps redirect chains flat (e.g. `cats→kittens→felines` collapses
       to two history rows both pointing at `felines`).
     - **`upsert`** (not insert) a `CategorySlugHistory` row keyed on
       `oldSlug = currentSlug` with `currentSlug = newSlug` (upsert handles a
       rename-back where that `oldSlug` row already exists).
     - Delete any history row whose `oldSlug === newSlug` to prevent a
       self-redirect loop.

- **`deleteCategory(slug)`** — pre-count products
  (`prisma.product.count({ where: { categorySlug: slug } })`); if `> 0`, return
  `{ success: false, error: "This category has products. Reassign or remove them first." }`.
  Otherwise `prisma.category.delete({ where: { slug } })`. `CategorySlugHistory`
  rows cascade away (`onDelete: Cascade`).

### 3. Schema change — `CategorySlugHistory`

```prisma
model CategorySlugHistory {
  oldSlug     String   @id
  currentSlug String
  category    Category @relation(fields: [currentSlug], references: [slug], onDelete: Cascade, onUpdate: Cascade)
  @@index([currentSlug])
}
```

Add `slugHistory CategorySlugHistory[]` to `Category`. One Prisma migration
(PostgreSQL).

### 4. Storefront redirect

In [app/categories/[slug]/page.tsx](../../../app/categories/[slug]/page.tsx),
before `notFound()` (line 44): look up `CategorySlugHistory` by the requested
slug; if found, **`permanentRedirect("/categories/{currentSlug}")` (308, not the
307 `redirect`)** so link equity / bookmarks carry over — the whole point of the
history table. Add the same lookup to `generateMetadata` so metadata resolves for
old slugs too.

### 5. Caching

Reuse the `revalidate()` pattern: `revalidatePath("/admin/categories")` +
`revalidateTag("catalog", "max")` (and the `"categories"` tag) so the storefront
category strip and category filters refresh after a change.

### 6. Testing

- `updateCategory` rename (slug changes): slug regenerates, products'
  `categorySlug` follow via cascade, a history row is created, and the old
  `/categories/{oldSlug}` URL 308-redirects to the new one.
- `updateCategory` cosmetic edit (name changes but slug doesn't, e.g.
  `"cats" → "Cats"`): only name/image update; slug stable; **no** history row;
  **no** `-2` suffix.
- `updateCategory` rename-back (A→B then B→A): history upsert doesn't collide;
  self-loop history row is removed.
- `deleteCategory`: blocked with friendly error when products exist; succeeds and
  cascades history when empty.
- Slug collision with a *different* category on rename resolves via `uniqueSlug`.
- Non-admin caller rejected (`requireAdmin`).

## Trade-offs / Notes

- The slug-history table is the cost of keeping old links alive (redirects chosen
  over 404s). It is small and self-cleaning: cascade-delete on category removal,
  and `ON UPDATE CASCADE` flattens redirect chains automatically.
- A rename writes across all products in that category. Fine at this catalog's
  scale, and renames are a rare admin action.
- Slug-follows-name and the redirect table were chosen explicitly over the
  simpler recommendations; this spec implements them correctly rather than
  reopening that decision.

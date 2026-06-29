## Why

Categories can only be *created* inline from the product form — there is no way for an admin to list, edit, or delete them. Admins need a real management surface, and renaming a category safely is non-trivial because the slug is the primary key, the product foreign key, and part of storefront URLs.

## What Changes

- Add a full-CRUD `/admin/categories` area: list page (with product counts), create, edit (name + image), and safe-delete, plus a "Categories" sidebar nav link.
- Consolidate category Server Actions into `app/admin/categories/actions.ts` (`createCategory`, `updateCategory`, `deleteCategory`); move `createCategory` out of the products actions and repoint its importer.
- **Rename behavior:** editing a category's name regenerates its slug. The product→category FK is `ON UPDATE CASCADE`, so the new slug propagates to products automatically.
- Add a `CategorySlugHistory` table + migration that records old→current slug mappings, and make the storefront category route **308-redirect** retired slugs to the current one.
- **Safe-delete:** a category can be deleted only when no products reference it (DB enforces `RESTRICT`; the action pre-checks and returns a friendly message otherwise).
- Reject category names that slugify to empty (e.g. all-symbol names) to avoid an empty-string PK.

## Capabilities

### New Capabilities
- `admin-category-management`: admin-side category lifecycle — list, create, edit (with slug regeneration on rename), safe-delete, and retired-slug redirects.

### Modified Capabilities
<!-- None — no existing capability's requirements change. -->

## Impact

- Schema: new `CategorySlugHistory` model + migration (`20260629120000_add_category_slug_history`). PostgreSQL.
- Code: new `app/admin/categories/actions.ts`, pages under `app/admin/categories/`, components under `app/_components/admin/categories/`, sidebar nav, storefront redirect in `app/categories/[slug]/page.tsx`, helper in `app/_lib/products.ts`; `createCategory` removed from `app/admin/products/actions.ts` and repointed in `category-select.tsx`.
- Auth: all mutations gated by `requireAdmin()`.
- Already implemented and committed to `main` (c2aec2c, 36a72ed, e396d67, 6b60672, 83c9a87, 7a83bd4); this registers it retroactively. Migration apply + browser verification are pending against a real database.

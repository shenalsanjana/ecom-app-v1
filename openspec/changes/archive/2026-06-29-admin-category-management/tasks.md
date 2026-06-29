# Tasks

> Implemented and committed to `main` (c2aec2c, 36a72ed, e396d67, 6b60672, 83c9a87, 7a83bd4) prior to OpenSpec registration. All boxes reflect completed work.

## 1. Schema

- [x] 1.1 Add `CategorySlugHistory` model + `Category.slugHistory` back-relation to `prisma/schema.prisma`
- [x] 1.2 Author migration `20260629120000_add_category_slug_history` (CREATE TABLE + index + FK Cascade/Cascade); run `prisma generate`

## 2. Server Actions

- [x] 2.1 Create `app/admin/categories/actions.ts` with `createCategory`, `updateCategory`, `deleteCategory` (all `requireAdmin`, `CategoryActionResult`, `revalidate`)
- [x] 2.2 `updateCategory` branches on slug; rename path uses self-excluding uniqueness, then transaction: update + history upsert + self-loop deleteMany
- [x] 2.3 `deleteCategory` pre-counts products and refuses if `> 0`
- [x] 2.4 Empty-slug guard in create + update (and mirror guard in product create)
- [x] 2.5 Vitest coverage for cosmetic edit, rename, collision suffix, blocked delete, empty-slug rejection

## 3. Refactor

- [x] 3.1 Move `createCategory` out of `app/admin/products/actions.ts`; repoint `category-select.tsx`; remove the moved test

## 4. Storefront Redirect

- [x] 4.1 Add `getCategorySlugRedirect` to `app/_lib/products.ts`
- [x] 4.2 `app/categories/[slug]/page.tsx`: `permanentRedirect` (308) retired slugs in both the page and `generateMetadata`, before `notFound()`

## 5. Admin UI

- [x] 5.1 Add "Categories" link to `admin-sidebar.tsx`
- [x] 5.2 `CategoryForm`, `DeleteCategoryButton`, `CategoriesTable` components
- [x] 5.3 `/admin/categories` list page (with product counts), `new`, and `[slug]/edit` pages

## 6. Verification

- [x] 6.1 `npm run test` green; `npx tsc --noEmit` exit 0
- [ ] 6.2 Apply migration (`npx prisma migrate deploy`) against the real DB (deferred — no DB in dev env)
- [ ] 6.3 Browser manual verification: create/edit/delete, rename redirect, in-use delete blocked (deferred — requires admin login + DB)

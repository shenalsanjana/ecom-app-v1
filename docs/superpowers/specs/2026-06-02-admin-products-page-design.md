# Admin Products Page — Design

**Date:** 2026-06-02
**Spec #:** 4 of 9 (Dressing Bear admin dashboard)
**Status:** Draft — pending implementation plan
**Depends on:** Spec #1 (admin roles & route protection), #2 (admin UI shell), #3 (admin Orders page) — all shipped.

---

## 1. Goal

Build the **Products** admin page at `/admin/products` (list) with create at `/admin/products/new` and edit at `/admin/products/[id]/edit` — the catalog manager. An admin can list/search/filter products, create and edit them (name, slug, category, pricing, stock, sizes, description, main image + gallery), quick-edit stock from the list, soft-archive products, and create a new category inline from the product form.

## 2. Non-goals

- **Real file upload.** Images are entered as URL/path strings (matches the current `image: String` model). No `@vercel/blob`/S3/Cloudinary. Real upload is a later enhancement.
- **Hard delete.** Products are **soft-archived** (an `archived` flag) — never hard-deleted — because they're referenced by `OrderItem` (order history).
- **Category edit/delete / full category management.** Only **inline create** of a category from the product form is in scope. Editing/removing categories is a later spec.
- **Bulk actions** (multi-select archive/price) — deferred.
- **Slug change on edit.** A product's slug is its primary key, storefront URL (`/products/[id]`), and order reference — it is **immutable after creation**.
- Orders / Customers / Settings pages — specs #3 (done) / #5 / #6.

## 3. Constraints from the existing codebase

- **Next.js 16 App Router.** Pages render inside `app/admin/layout.tsx` (chrome + `requireAdmin()`). Server Components for pages/data; interactive form bits are leaf `"use client"`. Never an `async` Server Component inside a client component (CLAUDE.md §3).
- **Auth:** every Server Action calls `requireAdmin()` (defense-in-depth atop the layout + `proxy.ts` edge gate).
- **Prisma + Postgres, `connection_limit=2`.** Keep list queries light (one `findMany` + one `count`, plus a few tab `count`s). Reuse the atomic `updateMany`-with-guard pattern only where needed (stock isn't oversell-sensitive here, but keep writes simple).
- **Data model (`prisma/schema.prisma`):**
  - `Product`: `id String @id` (**human slug, no default** — must be generated on create), `name`, `price Float`, `originalPrice Float?`, `image String` (main), `description String`, `stock Int @default(0)`, `categorySlug String` (FK → `Category`), `sizes String @default("S,M,L,XL")` (CSV). Relations: `images ProductImage[]` (gallery), `reviews`, `wishlistItems`, `orderItems`.
  - `ProductImage`: `{ id, productId, url, sortOrder }`, cascade-deletes with product.
  - `Category`: `{ slug @id, name, image, products[] }`.
- **Images are static** under `public/products/...` (e.g. `/products/cat-white/main.jpg`). `next.config` allows `picsum.photos` remote images. Image fields are plain strings.
- **Storefront product reads** live in `app/_lib/products.ts` (and any product list/detail queries). These must be updated to exclude archived products (§4.2).
- **shadcn primitives:** `select`, `table`, `badge`, `textarea`, `dialog` are installed (from spec #3). Reuse; no new installs expected.
- **Patterns to mirror:** spec #3's `app/_lib/admin-orders.ts` (pure helpers + queries split), `app/admin/orders/actions.ts` (action shape `{success:true,warning?} | {success:false,error}`, `requireAdmin` first, `revalidatePath`), and the Orders list/detail UI components.

## 4. Design

### 4.1 Schema change

Add to `model Product`:

```prisma
  archived  Boolean  @default(false)
  @@index([archived])
```

Apply with `npx prisma db push` (the project applies schema via db push, not `migrate dev` — see spec #3 history). No data migration needed; existing products default to `archived=false`.

### 4.2 Cross-cutting: storefront must hide archived products

Every storefront-facing product query must add `where: { archived: false }`. Audit and update `app/_lib/products.ts` (list, by-category, by-id, search, related) and any other reader (home grids, category pages, product page, wishlist hydration). Admin queries show all (with a tab filter). This is the one change outside `app/admin/products/`.

> Acceptance hinges on this: an archived product must 404 / disappear on the storefront but still render in admin and in past orders.

### 4.3 Routes & file map

| File | Type | Responsibility |
|------|------|----------------|
| `app/admin/products/page.tsx` | Server | Read `searchParams` (`q,tab,category,page`), call `listProducts` + tab counts + `listCategories`, render toolbar + table |
| `app/admin/products/loading.tsx` | Server | Skeleton |
| `app/admin/products/new/page.tsx` | Server | Render `<ProductForm mode="create">` with categories |
| `app/admin/products/[id]/edit/page.tsx` | Server | `getProduct(id)` (404 if missing) → `<ProductForm mode="edit">` |
| `app/admin/products/[id]/edit/not-found.tsx` | Server | "Product not found" |
| `app/admin/products/actions.ts` | `"use server"` | `createProduct`, `updateProduct`, `updateStock`, `archiveProduct`, `unarchiveProduct`, `createCategory` |
| `app/_lib/admin-products.ts` | server module | Pure helpers + queries (§4.7) |
| `app/_components/admin/products/products-toolbar.tsx` | `"use client"` | search + category select + tabs (URL-driven) |
| `app/_components/admin/products/products-table.tsx` | Server | rows incl. inline `<StockQuickEdit>` |
| `app/_components/admin/products/stock-quick-edit.tsx` | `"use client"` | stock input, saves on blur/Enter via `updateStock` |
| `app/_components/admin/products/product-form.tsx` | `"use client"` | full create/edit form; submits `createProduct`/`updateProduct` |
| `app/_components/admin/products/gallery-editor.tsx` | `"use client"` | gallery URL rows: add/remove/reorder |
| `app/_components/admin/products/category-select.tsx` | `"use client"` | category dropdown + inline "＋ New category" (calls `createCategory`) |
| `app/_lib/__tests__/admin-products.test.ts` | unit | pure helpers + query shapes (mock prisma) |
| `app/admin/products/__tests__/actions.test.ts` | unit | action guards, slug uniqueness, create/update/archive/stock/category |
| `tests/e2e/admin-products.spec.ts` | e2e | list, create, edit, inline stock, archive, inline category |

### 4.4 List page (`/admin/products`)

- **Toolbar:** search box (`q` — matches `name` and `id`/slug), Category `<select>` (`category` param, from `listCategories`), **＋ New product** link → `/admin/products/new`.
- **Quick-filter tabs** with counts: **Active** (`archived=false`, default), **Low stock** (`archived=false AND stock ≤ 5` — matches the dashboard KPI), **Archived** (`archived=true`), **All**.
- **Columns:** thumbnail (`image`) · Name (+ slug) · Category · Price (+ `originalPrice` strikethrough when set) · **Stock** (inline-editable) · Sizes · Status (Active/Archived `Badge`).
- **Inline stock edit** (`stock-quick-edit.tsx`): a numeric input that calls `updateStock(id, n)` on blur/Enter; everything else → row click to the edit form. Archived rows are dimmed.
- **Pagination:** server-side, 25/page, `?page=`.

### 4.5 Create/edit form (shared `product-form.tsx`)

One client component, `mode: "create" | "edit"`:

- **Details:** Name; **Slug** — on create, auto-derived from name (live) and editable; on edit, **read-only** (PK/URL/order ref). Category via `category-select`.
- **Pricing & stock:** `price`, `originalPrice` (optional), `stock`.
- **Sizes:** toggle chips for `S,M,L,XL` + an "add custom" input; serialized to the CSV `sizes` string.
- **Description:** textarea.
- **Main image:** URL/path input + live `<img>` preview. Required (non-empty).
- **Gallery (`gallery-editor`):** ordered list of URL rows; add / remove / reorder (drag or up/down). Persisted as `ProductImage` rows with `sortOrder` = list index.
- **Status (edit only):** Active/Archived toggle (wired to `archiveProduct`/`unarchiveProduct`), plus a header **View on storefront ↗** link.
- **Header actions:** Cancel (→ list) and Save (submit). On success → redirect to the list (or stay with a success toast).

Submitting calls `createProduct(input)` or `updateProduct(id, input)` where `input` carries all scalar fields + `sizes: string[]` + `gallery: string[]`.

### 4.6 Category inline-create (`category-select.tsx`)

The category dropdown includes a **＋ New category** option that reveals a small inline form: **Name** (→ auto slug), **Image URL/path**. On submit it calls `createCategory({ name, image })` which slugifies the name (unique), creates the `Category`, and the new slug becomes the selected value. No page navigation.

### 4.7 Pure helpers + queries (`admin-products.ts`)

Extract logic for unit testing under the project's node-env, `.ts`-only vitest:

- `slugify(name: string): string` — lowercase, spaces/punctuation → hyphens, trim.
- `uniqueSlug(base: string, exists: (slug) => Promise<boolean>): Promise<string>` — append `-2`, `-3`… until free. (Used by `createProduct` and `createCategory`.)
- `parseSizes(csv: string): string[]` / `serializeSizes(list: string[]): string` — split/trim/filter/join; dedupe; preserve order.
- `buildProductWhere({ tab, category, q }): Prisma.ProductWhereInput` — tab→archived/stock, category→categorySlug, q→`OR` on `name`/`id` (insensitive). Low-stock constant `LOW_STOCK_THRESHOLD = 5` (shared with dashboard intent).
- Queries: `listProducts(params & {page,pageSize})` → `{rows,total}` (include category name, gallery count); `getProduct(id)` (include `images` ordered, category); `listCategories()`.

### 4.8 Server actions (`actions.ts`)

Each: `requireAdmin()` → zod validate → mutate → `revalidatePath` → `{success}|{error}`.

| Action | Behavior | Notes |
|--------|----------|-------|
| `createProduct(input)` | Generate unique slug from name; create `Product` + `ProductImage[]` from gallery in a `$transaction`. | Reject empty name / non-positive price / empty main image / unknown category. |
| `updateProduct(id, input)` | Update scalars + sizes; **replace the gallery** — in a `$transaction`, delete all existing `ProductImage` rows for the product and recreate them from the submitted ordered list with `sortOrder` = index. Slug NOT updated. | Guard: product exists. |
| `updateStock(id, stock)` | Set `stock` (int ≥ 0). | The inline list action; lightweight. |
| `archiveProduct(id)` / `unarchiveProduct(id)` | Toggle `archived`. | Soft delete; revalidate both admin and affected storefront paths. |
| `createCategory({name,image})` | Slugify the name → `uniqueSlug` (suffix `-2`… if taken) → create a new `Category`. Returns `{success, slug, name}` for the select to adopt. | Reject empty name/image. A clashing slug always gets a unique suffix (never silently reuses an existing category). |

`revalidatePath('/admin/products')` on every action; archive/unarchive and product edits also `revalidatePath('/')` and the product/category storefront paths so the shop reflects changes.

### 4.9 Data flow

```
List:   /admin/products?tab=low-stock&category=cat
        → page.tsx (server) → listProducts(parsed) + tab counts + listCategories
        → table (+ inline StockQuickEdit calling updateStock) ; New → /new

Create: /admin/products/new → ProductForm(create) → createProduct(input)
        → slugify+unique → $transaction(create product + gallery) → revalidate → redirect to list

Edit:   /admin/products/[id]/edit → getProduct → ProductForm(edit)
        → updateProduct/updateStock/archive ; CategorySelect → createCategory (inline)
```

### 4.10 Error handling

- Discriminated `ActionResult`; client surfaces success/Error (toast or inline), mirroring the Orders components.
- **Slug collision** on create resolved automatically by `uniqueSlug`; surfaced in the form as the final slug.
- **Unknown category** / empty required fields → `{success:false, error}` from zod; form shows the message.
- Main image required; gallery may be empty.
- `getProduct` missing → `not-found`.
- DB errors wrapped in try/catch → generic error result (consistent with Orders actions).

### 4.11 Testing

**Unit (`.ts`, mock prisma):**
- `slugify` (spaces, punctuation, case, unicode-ish), `uniqueSlug` (suffix progression), `parseSizes`/`serializeSizes` (dedupe, trim, order), `buildProductWhere` (each tab + category + search).
- Actions: `requireAdmin` rejection; `createProduct` generates unique slug + creates gallery; `updateProduct` replaces gallery and never changes slug; `updateStock` rejects negative; `archiveProduct`/`unarchive` toggle; `createCategory` slugifies + returns slug.
- Storefront filter: a regression test asserting the product reader's `where` includes `archived: false`.

**E2E (`tests/e2e/admin-products.spec.ts`, seeded admin):**
1. List renders; tabs (Active/Low stock/Archived/All) + category filter + search work (URL-driven).
2. **Create:** New → fill name (slug auto-fills) + category + price + stock + main image → Save → appears in list.
3. **Edit:** change price/stock → persists; slug field read-only.
4. **Inline stock:** edit a row's stock box → value persists after reload.
5. **Archive:** archive a product → moves to Archived tab; (storefront check optional in e2e).
6. **Inline category:** ＋ New category in the form → creates and selects it.

## 5. Rollout plan

1. `npx prisma db push` (adds `Product.archived` + index; regenerates client).
2. Update storefront product readers to filter `archived: false` (§4.2) — with the regression test.
3. Implement `admin-products.ts`, actions, pages, components on `feat/admin-products` off `main`.
4. Smoke locally as seeded admin: create → edit → inline stock → archive → inline category; verify archived product hidden on storefront.
5. Deploy: run `db push` on the environment; no new env vars.

## 6. Open / deferred decisions

- **Real image upload** — out; URL input now. Revisit with Vercel Blob later.
- **Category edit/delete + management page** — out; inline-create only.
- **Bulk actions** — deferred.
- **Variant-level inventory** (stock per size) — out; stock is product-level, as today.
- **Slug edit / redirects** — out; slug immutable post-create.

## 7. Risks & mitigations

- **Missing a storefront query in the archived-filter audit** → an archived product still shows on the shop. Mitigation: grep all `prisma.product.find*` reads; add the regression unit test; manual storefront smoke.
- **Connection pool (limit 2):** list = `findMany` + `count` + up to 4 tab counts. Compute tab counts in a `groupBy` if it strains; start simple (per spec #3 precedent).
- **Slug uniqueness race** (two creates, same name, same instant): low risk on a 1-2 admin tool; `uniqueSlug` checks then the unique PK constraint backstops (create throws → surfaced as error).
- **Gallery replace semantics:** `updateProduct` deletes-and-recreates `ProductImage` rows; ensure it's in a `$transaction` so a partial failure doesn't orphan the gallery.
- **Image URL typos** (broken images): acceptable for v1 (URL input); live preview in the form helps the operator catch them.

## 8. Caveats (carried forward)

- **JWT TTL 30 days** (spec #1 §9): a revoked admin keeps access until token expiry.
- **Pre-existing e2e/lint debt** (spec #2 §9) still applies; this spec's own files must pass clean.

## 9. Acceptance criteria

1. `/admin/products` lists products with search, category filter, the four tabs (Active/Low stock/Archived/All), and server-side pagination — all URL-driven.
2. "Low stock" tab = `archived=false AND stock ≤ 5`; "Archived" = `archived=true`.
3. Inline stock edit on a row persists via `updateStock` and survives reload.
4. `/admin/products/new` creates a product: slug auto-derived from name (unique, editable), category selected, price/stock/sizes/description/main image saved, optional gallery saved as ordered `ProductImage` rows.
5. `/admin/products/[id]/edit` edits all fields except slug (read-only); gallery add/remove/reorder persists; missing id → not-found.
6. Sizes edit via chips serializes to the CSV `sizes` the storefront reads; main image is required.
7. Archive hides the product from the storefront (all readers filter `archived:false`) while keeping it in admin and in past orders; unarchive restores it.
8. ＋ New category in the form creates a `Category` (unique slug from name + image) and selects it without leaving the form.
9. Every Server Action enforces `requireAdmin()`; spec #1 redirect/401/403 invariants hold.
10. Storefront archived-filter regression test passes; archived product 404s on the shop.
11. All unit + e2e tests pass; `npm run build`, `tsc --noEmit`, `npm run lint` clean for this spec's files.

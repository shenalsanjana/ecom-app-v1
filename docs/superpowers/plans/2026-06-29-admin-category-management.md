# Admin Category Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-CRUD `/admin/categories` page — list, create, edit (name + image, slug regenerated on rename), and safe-delete — with old-slug → new-slug redirects so renames never break existing links.

**Architecture:** Category mutations move into a dedicated `app/admin/categories/actions.ts`. Renames change the `Category.slug` PK; the existing `ON UPDATE CASCADE` FK propagates the new slug to products and to a new `CategorySlugHistory` table (which keeps redirect chains flat). The storefront category route consults that table and `permanentRedirect`s old slugs. New admin pages mirror the products admin (`page` / `new` / `[slug]/edit` + a shared form).

**Tech Stack:** Next.js 16 App Router, React Server/Client Components, Prisma (PostgreSQL), NextAuth v5, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-29-admin-category-management-design.md](../specs/2026-06-29-admin-category-management-design.md)

## Global Constraints

- All admin mutations call `await requireAdmin()` first (from `@/app/_lib/admin-auth`).
- Server Actions return `CategoryActionResult`: `{ success: true; slug?: string; name?: string } | { success: false; error: string }`.
- Slug generation uses `slugify` + `uniqueSlug` from `@/app/_lib/admin-products` (re-exported from `product-helpers`).
- The product→category FK is `ON UPDATE CASCADE` (verified in the init migration). Renaming `Category.slug` propagates to `Product.categorySlug` and `CategorySlugHistory.currentSlug` automatically — do **not** hand-update those columns.
- Rename decision branches on the **slug**, not the name: only regenerate/record history when `slugify(newName) !== currentSlug`.
- Client components surface errors with `alert(r.error)` and refresh via `router.refresh()`.
- Database: PostgreSQL. Migrations run with `DATABASE_URL` set per README (PowerShell: `$env:DATABASE_URL="..."`).
- Test command: `npm run test`. Build command: `npm run build`.

---

### Task 1: Add the `CategorySlugHistory` model + migration

**Files:**
- Modify: `prisma/schema.prisma` (Category model at lines 42-47; add new model after it)

**Interfaces:**
- Produces: Prisma model `CategorySlugHistory { oldSlug @id, currentSlug, category }` and `Category.slugHistory` back-relation — consumed by Tasks 2 and 4.

- [ ] **Step 1: Add the back-relation field to `Category`**

In `prisma/schema.prisma`, change the `Category` model (lines 42-47) to:

```prisma
model Category {
  slug        String                @id
  name        String
  image       String
  products    Product[]
  slugHistory CategorySlugHistory[]
}
```

- [ ] **Step 2: Add the `CategorySlugHistory` model**

Immediately after the `Category` model, add:

```prisma
model CategorySlugHistory {
  oldSlug     String   @id
  currentSlug String
  category    Category @relation(fields: [currentSlug], references: [slug], onDelete: Cascade, onUpdate: Cascade)

  @@index([currentSlug])
}
```

- [ ] **Step 3: Create and apply the migration**

Ensure `DATABASE_URL` points at the dev database (see README; in PowerShell `$env:DATABASE_URL="postgresql://..."`), then run:

Run: `npx prisma migrate dev --name add_category_slug_history`
Expected: a new folder under `prisma/migrations/*_add_category_slug_history/` with `CREATE TABLE "CategorySlugHistory"`, and `prisma generate` runs so `prisma.categorySlugHistory` is typed.

- [ ] **Step 4: Verify the client typings compile**

Run: `npx tsc --noEmit`
Expected: PASS — no errors (the new `categorySlugHistory` delegate exists on the Prisma client).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add CategorySlugHistory for category-rename redirects"
```

---

### Task 2: Category Server Actions (`createCategory`, `updateCategory`, `deleteCategory`)

**Files:**
- Create: `app/admin/categories/actions.ts`
- Create: `app/admin/categories/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `prisma`, `slugify`, `uniqueSlug`, `CategorySlugHistory` model (Task 1).
- Produces (used by Tasks 3, 5):
  - `createCategory(input: { name: string; image: string }): Promise<CategoryActionResult>`
  - `updateCategory(currentSlug: string, input: { name: string; image: string }): Promise<CategoryActionResult>`
  - `deleteCategory(slug: string): Promise<CategoryActionResult>`
  - `type CategoryActionResult`

- [ ] **Step 1: Write the failing tests**

Create `app/admin/categories/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const {
  categoryCreate, categoryUpdate, categoryFindUnique, categoryFindFirst, categoryDelete,
  historyUpsert, historyDeleteMany, productCount, txn,
} = vi.hoisted(() => ({
  categoryCreate: vi.fn(), categoryUpdate: vi.fn(), categoryFindUnique: vi.fn(),
  categoryFindFirst: vi.fn(), categoryDelete: vi.fn(),
  historyUpsert: vi.fn(), historyDeleteMany: vi.fn(), productCount: vi.fn(), txn: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

function makeClient() {
  return {
    category: { create: categoryCreate, update: categoryUpdate, findUnique: categoryFindUnique, findFirst: categoryFindFirst, delete: categoryDelete },
    categorySlugHistory: { upsert: historyUpsert, deleteMany: historyDeleteMany },
    product: { count: productCount },
  };
}

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { ...makeClient(), $transaction: txn.mockImplementation(async (fn: (c: unknown) => unknown) => fn(makeClient())) },
}));

import { createCategory, updateCategory, deleteCategory } from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  categoryCreate.mockReset(); categoryUpdate.mockReset(); categoryFindUnique.mockReset();
  categoryFindFirst.mockReset(); categoryDelete.mockReset();
  historyUpsert.mockReset(); historyDeleteMany.mockReset(); productCount.mockReset();
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => fn(makeClient()));
});

describe("createCategory", () => {
  it("rejects empty name or image", async () => {
    expect(await createCategory({ name: "  ", image: "/x.jpg" })).toEqual({ success: false, error: "Name and image are required" });
    expect(await createCategory({ name: "Hats", image: "" })).toEqual({ success: false, error: "Name and image are required" });
  });
  it("slugifies, ensures uniqueness, creates, and returns the slug", async () => {
    categoryFindUnique.mockResolvedValueOnce({ slug: "hats" }).mockResolvedValueOnce(null); // 'hats' taken, 'hats-2' free
    categoryCreate.mockResolvedValueOnce({ slug: "hats-2", name: "Hats" });
    const res = await createCategory({ name: "Hats", image: "/hats.jpg" });
    expect(categoryCreate).toHaveBeenCalledWith({ data: { slug: "hats-2", name: "Hats", image: "/hats.jpg" } });
    expect(res).toEqual({ success: true, slug: "hats-2", name: "Hats" });
  });
});

describe("updateCategory", () => {
  it("cosmetic edit (name changes but slug doesn't): updates name/image only, no history, no suffix", async () => {
    categoryUpdate.mockResolvedValueOnce({});
    const res = await updateCategory("cats", { name: "Cats", image: "/cats.jpg" }); // slugify('Cats') === 'cats'
    expect(categoryUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { name: "Cats", image: "/cats.jpg" } });
    expect(categoryFindFirst).not.toHaveBeenCalled();
    expect(historyUpsert).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, slug: "cats", name: "Cats" });
  });
  it("rename (slug changes): regenerates slug, records history, clears self-loop", async () => {
    categoryFindFirst.mockResolvedValueOnce(null); // 'kittens' free (excluding self)
    categoryUpdate.mockResolvedValueOnce({});
    historyUpsert.mockResolvedValueOnce({});
    historyDeleteMany.mockResolvedValueOnce({ count: 0 });
    const res = await updateCategory("cats", { name: "Kittens", image: "/k.jpg" });
    expect(categoryFindFirst).toHaveBeenCalledWith({ where: { slug: "kittens", NOT: { slug: "cats" } } });
    expect(categoryUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { slug: "kittens", name: "Kittens", image: "/k.jpg" } });
    expect(historyUpsert).toHaveBeenCalledWith({
      where: { oldSlug: "cats" },
      update: { currentSlug: "kittens" },
      create: { oldSlug: "cats", currentSlug: "kittens" },
    });
    expect(historyDeleteMany).toHaveBeenCalledWith({ where: { oldSlug: "kittens" } });
    expect(res).toEqual({ success: true, slug: "kittens", name: "Kittens" });
  });
  it("rename collides with a different category: appends a numeric suffix", async () => {
    categoryFindFirst.mockResolvedValueOnce({ slug: "kittens" }).mockResolvedValueOnce(null); // 'kittens' taken, 'kittens-2' free
    categoryUpdate.mockResolvedValueOnce({});
    historyUpsert.mockResolvedValueOnce({});
    historyDeleteMany.mockResolvedValueOnce({ count: 0 });
    const res = await updateCategory("cats", { name: "Kittens", image: "/k.jpg" });
    expect(categoryUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { slug: "kittens-2", name: "Kittens", image: "/k.jpg" } });
    expect(res).toEqual({ success: true, slug: "kittens-2", name: "Kittens" });
  });
});

describe("deleteCategory", () => {
  it("blocks deletion when the category still has products", async () => {
    productCount.mockResolvedValueOnce(4);
    const res = await deleteCategory("cats");
    expect(productCount).toHaveBeenCalledWith({ where: { categorySlug: "cats" } });
    expect(categoryDelete).not.toHaveBeenCalled();
    expect(res).toEqual({ success: false, error: "This category has products. Reassign or remove them first." });
  });
  it("deletes an empty category", async () => {
    productCount.mockResolvedValueOnce(0);
    categoryDelete.mockResolvedValueOnce({});
    const res = await deleteCategory("cats");
    expect(categoryDelete).toHaveBeenCalledWith({ where: { slug: "cats" } });
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- categories`
Expected: FAIL — cannot import `../actions` (file does not exist yet).

- [ ] **Step 3: Implement the actions**

Create `app/admin/categories/actions.ts`:

```typescript
"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { slugify, uniqueSlug } from "@/app/_lib/admin-products";

export type CategoryActionResult =
  | { success: true; slug?: string; name?: string }
  | { success: false; error: string };

const CategorySchema = z.object({
  name: z.string().trim().min(1),
  image: z.string().trim().min(1),
});

function revalidate() {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products"); // product form's category dropdown
  revalidateTag("catalog", "max"); // bust storefront category caches (catalog/categories tags)
}

export async function createCategory(input: { name: string; image: string }): Promise<CategoryActionResult> {
  await requireAdmin();
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and image are required" };

  const slug = await uniqueSlug(
    slugify(parsed.data.name),
    async (s) => (await prisma.category.findUnique({ where: { slug: s } })) !== null,
  );
  let created;
  try {
    created = await prisma.category.create({
      data: { slug, name: parsed.data.name, image: parsed.data.image },
    });
  } catch {
    return { success: false, error: "Could not create category." };
  }
  revalidate();
  return { success: true, slug: created.slug, name: created.name };
}

export async function updateCategory(
  currentSlug: string,
  input: { name: string; image: string },
): Promise<CategoryActionResult> {
  await requireAdmin();
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and image are required" };
  const { name, image } = parsed.data;

  const candidateSlug = slugify(name);

  // Name/image-only update — slug is unchanged, so no rename + no history row.
  if (candidateSlug === currentSlug) {
    try {
      await prisma.category.update({ where: { slug: currentSlug }, data: { name, image } });
    } catch {
      return { success: false, error: "Could not update category." };
    }
    revalidate();
    return { success: true, slug: currentSlug, name };
  }

  // Rename: resolve a unique new slug, excluding the current category itself.
  const newSlug = await uniqueSlug(
    candidateSlug,
    async (s) =>
      (await prisma.category.findFirst({ where: { slug: s, NOT: { slug: currentSlug } } })) !== null,
  );

  try {
    await prisma.$transaction(async (tx) => {
      // ON UPDATE CASCADE moves Product.categorySlug and existing
      // CategorySlugHistory.currentSlug rows to newSlug automatically.
      await tx.category.update({ where: { slug: currentSlug }, data: { slug: newSlug, name, image } });
      await tx.categorySlugHistory.upsert({
        where: { oldSlug: currentSlug },
        update: { currentSlug: newSlug },
        create: { oldSlug: currentSlug, currentSlug: newSlug },
      });
      // If newSlug was itself a previously-retired slug, drop that row to avoid a self-redirect loop.
      await tx.categorySlugHistory.deleteMany({ where: { oldSlug: newSlug } });
    });
  } catch {
    return { success: false, error: "Could not update category." };
  }
  revalidate();
  return { success: true, slug: newSlug, name };
}

export async function deleteCategory(slug: string): Promise<CategoryActionResult> {
  await requireAdmin();
  const productCount = await prisma.product.count({ where: { categorySlug: slug } });
  if (productCount > 0) {
    return { success: false, error: "This category has products. Reassign or remove them first." };
  }
  try {
    await prisma.category.delete({ where: { slug } });
  } catch {
    return { success: false, error: "Could not delete category." };
  }
  revalidate();
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- categories`
Expected: PASS — all `createCategory` / `updateCategory` / `deleteCategory` tests green.

- [ ] **Step 5: Commit**

```bash
git add app/admin/categories/actions.ts app/admin/categories/__tests__/actions.test.ts
git commit -m "feat(admin): add category create/update/delete server actions"
```

---

### Task 3: Repoint `createCategory` importers; remove the old copy

**Files:**
- Modify: `app/_components/admin/products/category-select.tsx:3` (import path)
- Modify: `app/admin/products/actions.ts` (remove `createCategory` + its `CategorySchema`)
- Modify: `app/admin/products/__tests__/actions.test.ts` (remove the `createCategory` describe block + its import)

**Interfaces:**
- Consumes: `createCategory` from Task 2's new module.

- [ ] **Step 1: Find every importer of the old `createCategory`**

Run: `grep -rn "products/actions\"" app | grep -i createCategory; grep -rln "createCategory" app`
Expected: the only runtime importer is `app/_components/admin/products/category-select.tsx`; the only test importer is `app/admin/products/__tests__/actions.test.ts`. (If `grep` surfaces others, update each the same way.)

- [ ] **Step 2: Repoint the `CategorySelect` import**

In `app/_components/admin/products/category-select.tsx`, change line 3 from:

```tsx
import { createCategory } from "@/app/admin/products/actions";
```

to:

```tsx
import { createCategory } from "@/app/admin/categories/actions";
```

- [ ] **Step 3: Remove `createCategory` and `CategorySchema` from the products actions**

In `app/admin/products/actions.ts`, delete the `CategorySchema` const (lines 53-56) and the entire `createCategory` function (lines 58-77). Leave the rest of the file unchanged.

- [ ] **Step 4: Remove the moved test from the products test file**

In `app/admin/products/__tests__/actions.test.ts`, delete the `import { createCategory } from "../actions";` line (line 74) and the whole `describe("createCategory", ...)` block (lines 76-88). (The `categoryCreate` / `categoryFindUnique` mocks can stay; they're harmless.)

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: PASS — both `app/admin/products` and `app/admin/categories` suites green; no dangling import of the removed `createCategory`.

- [ ] **Step 6: Commit**

```bash
git add app/_components/admin/products/category-select.tsx app/admin/products/actions.ts app/admin/products/__tests__/actions.test.ts
git commit -m "refactor(admin): move createCategory into categories/actions"
```

---

### Task 4: Storefront redirect for retired category slugs

**Files:**
- Modify: `app/_lib/products.ts` (add `getCategorySlugRedirect`)
- Modify: `app/categories/[slug]/page.tsx` (redirect in both `generateMetadata` and the page)

**Interfaces:**
- Consumes: `CategorySlugHistory` (Task 1).
- Produces: `getCategorySlugRedirect(oldSlug: string): Promise<string | null>`.

- [ ] **Step 1: Add the redirect lookup helper**

In `app/_lib/products.ts`, add (it already imports `prisma`; if not, add `import { prisma } from "@/app/_lib/prisma";`):

```typescript
export async function getCategorySlugRedirect(oldSlug: string): Promise<string | null> {
  const row = await prisma.categorySlugHistory.findUnique({ where: { oldSlug } });
  return row?.currentSlug ?? null;
}
```

- [ ] **Step 2: Redirect retired slugs in the page component**

In `app/categories/[slug]/page.tsx`:

Change the import on line 1 to add `permanentRedirect`:

```tsx
import { notFound, permanentRedirect } from "next/navigation";
```

Add the helper to the existing import from `@/app/_lib/products` (line 3):

```tsx
import { getCategories, getProducts, parseSortBy, getCategorySlugRedirect } from "@/app/_lib/products";
```

Replace the `if (!category) { notFound(); }` block (line 44) with:

```tsx
  const category = categories.find((c) => c.slug === slug);
  if (!category) {
    const dest = await getCategorySlugRedirect(slug);
    if (dest) permanentRedirect(`/categories/${dest}`);
    notFound();
  }
```

- [ ] **Step 3: Redirect retired slugs in `generateMetadata` too**

In the same file, replace the `if (!category) { return { title: "Category not found" }; }` block (lines 18-20) with:

```tsx
  if (!category) {
    const dest = await getCategorySlugRedirect(slug);
    if (dest) permanentRedirect(`/categories/${dest}`);
    return { title: "Category not found" };
  }
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: PASS — `/categories/[slug]` compiles; no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/products.ts app/categories/[slug]/page.tsx
git commit -m "feat(storefront): 308-redirect retired category slugs to current"
```

---

### Task 5: Admin categories pages, form, table, and nav link

**Files:**
- Create: `app/admin/categories/page.tsx`
- Create: `app/admin/categories/new/page.tsx`
- Create: `app/admin/categories/[slug]/edit/page.tsx`
- Create: `app/_components/admin/categories/category-form.tsx`
- Create: `app/_components/admin/categories/categories-table.tsx`
- Create: `app/_components/admin/categories/delete-category-button.tsx`
- Modify: `app/_components/admin/admin-sidebar.tsx` (add the nav item)

**Interfaces:**
- Consumes: `createCategory`, `updateCategory`, `deleteCategory` (Task 2); `ImageInput` (`@/app/_components/admin/products/image-input`); `prisma`.

- [ ] **Step 1: Add the sidebar nav item**

In `app/_components/admin/admin-sidebar.tsx`, add an entry to `ADMIN_NAV` (after the Products line, line 11):

```tsx
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
```

- [ ] **Step 2: Create the shared category form**

Create `app/_components/admin/categories/category-form.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCategory, updateCategory } from "@/app/admin/categories/actions";
import { ImageInput } from "@/app/_components/admin/products/image-input";

type Initial = { slug?: string; name: string; image: string };

export function CategoryForm({ mode, initial }: { mode: "create" | "edit"; initial: Initial }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [image, setImage] = useState(initial.image);
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const r =
        mode === "create"
          ? await createCategory({ name: name.trim(), image: image.trim() })
          : await updateCategory(initial.slug!, { name: name.trim(), image: image.trim() });
      if (!r.success) { alert(r.error); return; }
      router.push("/admin/categories");
      router.refresh();
    });
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{mode === "create" ? "New category" : `Edit · ${initial.name}`}</h1>
        <span className="ml-auto flex gap-2">
          <button onClick={() => router.push("/admin/categories")} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
          <button
            disabled={pending || !name.trim() || !image.trim()}
            onClick={submit}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Save
          </button>
        </span>
      </div>
      <div className="max-w-lg space-y-4">
        <div className="rounded-lg border p-4">
          <label className="text-xs text-muted-foreground">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
        </div>
        <div className="rounded-lg border p-4">
          <label className="mb-1 block text-xs text-muted-foreground">Image (URL / path or upload)</label>
          <ImageInput value={image} onChange={setImage} preview />
        </div>
        {mode === "edit" ? (
          <p className="text-xs text-muted-foreground">
            Renaming this category updates its URL. The old link will redirect automatically.
          </p>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create the delete button**

Create `app/_components/admin/categories/delete-category-button.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCategory } from "@/app/admin/categories/actions";

export function DeleteCategoryButton({ slug, name }: { slug: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function onClick() {
    if (!confirm(`Delete '${name}'? This cannot be undone.`)) return;
    start(async () => {
      const r = await deleteCategory(slug);
      if (!r.success) { alert(r.error); return; }
      router.refresh();
    });
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="rounded-md border border-destructive px-2 py-1 text-xs text-destructive disabled:opacity-50"
    >
      Delete
    </button>
  );
}
```

- [ ] **Step 4: Create the categories table**

Create `app/_components/admin/categories/categories-table.tsx`:

```tsx
import Link from "next/link";
import Image from "next/image";
import { DeleteCategoryButton } from "./delete-category-button";

type Row = { slug: string; name: string; image: string; productCount: number };

export function CategoriesTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No categories yet.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2"></th><th className="p-2">Name</th><th className="p-2">Slug</th>
          <th className="p-2">Products</th><th className="p-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.slug} className="border-b hover:bg-secondary/40">
            <td className="p-2"><Image src={c.image} alt="" width={36} height={36} className="rounded object-cover" /></td>
            <td className="p-2 font-medium">
              <Link href={`/admin/categories/${c.slug}/edit`} className="hover:underline">{c.name}</Link>
            </td>
            <td className="p-2 text-muted-foreground">{c.slug}</td>
            <td className="p-2">{c.productCount}</td>
            <td className="p-2 text-right">
              {c.productCount > 0
                ? <span className="text-xs text-muted-foreground">In use</span>
                : <DeleteCategoryButton slug={c.slug} name={c.name} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Create the list page**

Create `app/admin/categories/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/app/_lib/prisma";
import { CategoriesTable } from "@/app/_components/admin/categories/categories-table";

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  const rows = categories.map((c) => ({
    slug: c.slug, name: c.name, image: c.image, productCount: c._count.products,
  }));
  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <Link href="/admin/categories/new" className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
          New category
        </Link>
      </div>
      <CategoriesTable rows={rows} />
    </section>
  );
}
```

- [ ] **Step 6: Create the new + edit pages**

Create `app/admin/categories/new/page.tsx`:

```tsx
import { CategoryForm } from "@/app/_components/admin/categories/category-form";

export default function NewCategoryPage() {
  return <CategoryForm mode="create" initial={{ name: "", image: "" }} />;
}
```

Create `app/admin/categories/[slug]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/prisma";
import { CategoryForm } from "@/app/_components/admin/categories/category-form";

export default async function EditCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) notFound();
  return <CategoryForm mode="edit" initial={{ slug: category.slug, name: category.name, image: category.image }} />;
}
```

- [ ] **Step 7: Verify the build compiles**

Run: `npm run build`
Expected: PASS — `/admin/categories`, `/admin/categories/new`, `/admin/categories/[slug]/edit` all build.

- [ ] **Step 8: Manual verification (record result)**

`npm run dev`, sign in as admin:
- `/admin/categories` lists categories with product counts and a "Categories" sidebar link.
- Create a new category → it appears in the list and in the product form's category dropdown.
- Edit a category's **name** so the slug changes → products keep their category; visiting the **old** `/categories/<oldSlug>` redirects (308) to the new slug.
- Edit only capitalization (e.g. "cats" → "Cats") → name updates, slug stays `cats`, no redirect entry.
- Delete an **empty** category → row disappears. A category **with products** shows "In use" (no Delete button); the action also refuses if called.

Record the observed outcomes before committing.

- [ ] **Step 9: Commit**

```bash
git add app/admin/categories app/_components/admin/categories app/_components/admin/admin-sidebar.tsx
git commit -m "feat(admin): add /admin/categories CRUD pages and nav"
```

---

## Self-Review

**Spec coverage:**
- `/admin/categories` list with product counts → Task 5 (page + table). ✓
- Create (consolidated) → Task 2 `createCategory`, surfaced on the page (Task 5) and still inline in the product form (Task 3 repoint). ✓
- Edit name + image, slug regenerated on rename → Task 2 `updateCategory` (branches on slug, excludes self, upsert history, clears self-loop). ✓
- Safe-delete (blocked when products exist) → Task 2 `deleteCategory` + Task 5 "In use" UI. ✓
- `CategorySlugHistory` schema + migration → Task 1. ✓
- Storefront 308 redirect (page + metadata) → Task 4. ✓
- Move `createCategory`, repoint importers (grep first) → Task 3. ✓
- Sidebar nav link → Task 5 Step 1. ✓
- Caching via `revalidate()` (catalog tag) → Task 2 helper. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every run step has an exact command + expected result. ✓

**Type consistency:** `CategoryActionResult` defined in Task 2 and consumed unchanged by the Task 5 client components. `createCategory` / `updateCategory` / `deleteCategory` signatures match between Task 2 (produced), Task 3 (repointed import), and Task 5 (consumed). `getCategorySlugRedirect` defined in Task 4 Step 1 and used in Steps 2-3. ✓

**Ordering note:** Task 1 (schema) must precede Tasks 2 and 4 (they reference `categorySlugHistory`). Task 2 must precede Task 3 (repoint target) and Task 5 (consumers). Tasks are listed in a valid execution order.

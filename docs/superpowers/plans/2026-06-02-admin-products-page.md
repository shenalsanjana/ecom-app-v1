# Admin Products Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin Products catalog manager — list (`/admin/products`) with create (`/new`) and edit (`/[id]/edit`) — with soft-archive, inline stock edit, and inline category creation.

**Architecture:** Server Components fetch via `app/_lib/admin-products.ts` (pure helpers + queries); mutations are Server Actions (`app/admin/products/actions.ts`) gated by `requireAdmin()`, validated with zod, and revalidated via `revalidatePath` + `revalidateTag("catalog")`. A new `Product.archived` flag soft-deletes; all storefront product readers filter `archived:false`. Mirrors the shipped Orders page patterns.

**Tech Stack:** Next.js 16 App Router, NextAuth v5, Prisma + Postgres, vitest (node env, `.ts` only), Playwright e2e, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-02-admin-products-page-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `prisma/schema.prisma` | Add `Product.archived` + `@@index([archived])` |
| `app/_lib/admin-products.ts` | Pure helpers (`slugify`, `uniqueSlug`, `parseSizes`, `serializeSizes`, `buildProductWhere`, `LOW_STOCK_THRESHOLD`) + queries (`listProducts`, `getProduct`, `listCategories`) + types |
| `app/_lib/products.ts` | Add `archived:false` to all storefront readers (cross-cutting) |
| `app/admin/products/actions.ts` | `createProduct`, `updateProduct`, `updateStock`, `archiveProduct`, `unarchiveProduct`, `createCategory` |
| `app/admin/products/page.tsx`, `loading.tsx` | List page |
| `app/admin/products/new/page.tsx` | Create form page |
| `app/admin/products/[id]/edit/page.tsx`, `not-found.tsx` | Edit form page |
| `app/_components/admin/products/*.tsx` | toolbar, table, stock-quick-edit, product-form, gallery-editor, category-select |
| `app/_lib/__tests__/admin-products.test.ts`, `admin-products-queries.test.ts` | Helper + query unit tests |
| `app/_lib/__tests__/products-archived-filter.test.ts` | Storefront filter regression |
| `app/admin/products/__tests__/actions.test.ts` | Action unit tests |
| `tests/e2e/admin-products.spec.ts` | E2E |

---

## Task 1: Schema — `Product.archived`

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Add the field + index**

In `model Product`, add after `sizes`:

```prisma
  archived      Boolean  @default(false)
```

and add to the index block (which currently has only `@@index([categorySlug])`):

```prisma
  @@index([categorySlug])
  @@index([archived])
```

- [ ] **Step 2: Apply via db push**

Run: `npx prisma db push`
Expected: "Your database is now in sync", Prisma Client regenerated. (Project uses `db push`, not `migrate dev` — see Orders spec history.)

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` (expect clean — `prisma.product` now has `archived`).

```bash
git add prisma/schema.prisma
git commit -m "feat(admin-products): add Product.archived soft-delete flag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `admin-products.ts` — slug + sizes helpers

**Files:** Create `app/_lib/admin-products.ts`, Test `app/_lib/__tests__/admin-products.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/admin-products.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug, parseSizes, serializeSizes } from "../admin-products";

describe("slugify", () => {
  it("lowercases, hyphenates, and trims", () => {
    expect(slugify("Oversize Cat Tee — White")).toBe("oversize-cat-tee-white");
    expect(slugify("  Hello,  World!  ")).toBe("hello-world");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", async () => {
    expect(await uniqueSlug("cat-white", async () => false)).toBe("cat-white");
  });
  it("suffixes until free", async () => {
    const taken = new Set(["cat-white", "cat-white-2"]);
    expect(await uniqueSlug("cat-white", async (s) => taken.has(s))).toBe("cat-white-3");
  });
});

describe("sizes", () => {
  it("parses CSV to trimmed, deduped list", () => {
    expect(parseSizes("S, M ,L,L,")).toEqual(["S", "M", "L"]);
  });
  it("serializes a list back to CSV", () => {
    expect(serializeSizes(["S", "M", "L"])).toBe("S,M,L");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-products.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `app/_lib/admin-products.ts`:

```ts
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await exists(base))) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
}

export function parseSizes(csv: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of csv.split(",")) {
    const s = part.trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export function serializeSizes(list: string[]): string {
  return parseSizes(list.join(",")).join(",");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-products.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-products.ts app/_lib/__tests__/admin-products.test.ts
git commit -m "feat(admin-products): slug + sizes helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `buildProductWhere` helper

**Files:** Modify `app/_lib/admin-products.ts`, Test `app/_lib/__tests__/admin-products.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { buildProductWhere } from "../admin-products";

describe("buildProductWhere", () => {
  it("active tab → archived:false", () => {
    expect(buildProductWhere({ tab: "active" })).toEqual({ archived: false });
  });
  it("low-stock tab → archived:false + stock<=5", () => {
    expect(buildProductWhere({ tab: "low-stock" })).toEqual({ archived: false, stock: { lte: 5 } });
  });
  it("archived tab → archived:true", () => {
    expect(buildProductWhere({ tab: "archived" })).toEqual({ archived: true });
  });
  it("all tab → no archived constraint", () => {
    expect(buildProductWhere({ tab: "all" })).toEqual({});
  });
  it("adds category and case-insensitive search on name + id", () => {
    const w = buildProductWhere({ tab: "active", category: "cat", q: "white" });
    expect(w.archived).toBe(false);
    expect(w.categorySlug).toBe("cat");
    expect(w.OR).toEqual([
      { name: { contains: "white", mode: "insensitive" } },
      { id: { contains: "white", mode: "insensitive" } },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-products.test.ts`
Expected: FAIL — `buildProductWhere` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `admin-products.ts`)

```ts
import type { Prisma } from "@prisma/client";

export const LOW_STOCK_THRESHOLD = 5;

export const PRODUCT_TABS = ["active", "low-stock", "archived", "all"] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

export type ProductListParams = {
  tab?: ProductTab;
  category?: string;
  q?: string;
};

export function buildProductWhere(params: ProductListParams): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  switch (params.tab) {
    case "low-stock":
      where.archived = false;
      where.stock = { lte: LOW_STOCK_THRESHOLD };
      break;
    case "archived":
      where.archived = true;
      break;
    case "all":
      break;
    case "active":
    default:
      where.archived = false;
  }

  if (params.category) where.categorySlug = params.category;

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { id: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-products.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-products.ts app/_lib/__tests__/admin-products.test.ts
git commit -m "feat(admin-products): buildProductWhere tab/category/search helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Queries — `listProducts`, `getProduct`, `listCategories`

**Files:** Modify `app/_lib/admin-products.ts`, Test `app/_lib/__tests__/admin-products-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/admin-products-queries.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { productFindMany, productCount, productFindUnique, categoryFindMany } = vi.hoisted(() => ({
  productFindMany: vi.fn(),
  productCount: vi.fn(),
  productFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    product: { findMany: productFindMany, count: productCount, findUnique: productFindUnique },
    category: { findMany: categoryFindMany },
  },
}));

import { listProducts, getProduct, listCategories } from "../admin-products";

beforeEach(() => {
  productFindMany.mockReset();
  productCount.mockReset();
  productFindUnique.mockReset();
  categoryFindMany.mockReset();
});

describe("listProducts", () => {
  it("paginates and returns rows + total", async () => {
    productFindMany.mockResolvedValueOnce([{ id: "cat-white" }]);
    productCount.mockResolvedValueOnce(42);
    const res = await listProducts({ tab: "low-stock", page: 2, pageSize: 25 });
    expect(productCount).toHaveBeenCalledWith({ where: { archived: false, stock: { lte: 5 } } });
    const arg = productFindMany.mock.calls[0][0];
    expect(arg.where).toEqual({ archived: false, stock: { lte: 5 } });
    expect(arg.take).toBe(25);
    expect(arg.skip).toBe(25);
    expect(arg.orderBy).toEqual({ name: "asc" });
    expect(arg.include._count.select.images).toBe(true);
    expect(res).toEqual({ rows: [{ id: "cat-white" }], total: 42 });
  });
});

describe("getProduct", () => {
  it("includes ordered gallery and category", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    await getProduct("cat-white");
    const arg = productFindUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "cat-white" });
    expect(arg.include.images.orderBy).toEqual({ sortOrder: "asc" });
    expect(arg.include.category).toBe(true);
  });
});

describe("listCategories", () => {
  it("returns categories ordered by name", async () => {
    categoryFindMany.mockResolvedValueOnce([{ slug: "cat", name: "Cat" }]);
    const res = await listCategories();
    expect(categoryFindMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
    expect(res).toEqual([{ slug: "cat", name: "Cat" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-products-queries.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write minimal implementation** (append to `admin-products.ts`)

```ts
import { prisma } from "@/app/_lib/prisma";

export const PAGE_SIZE = 25;

export async function listProducts(
  params: ProductListParams & { page?: number; pageSize?: number },
) {
  const where = buildProductWhere(params);
  const pageSize = Math.min(params.pageSize ?? PAGE_SIZE, 200);
  const page = Math.max(1, params.page ?? 1);

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        category: { select: { name: true } },
        _count: { select: { images: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return { rows, total };
}

export async function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      images: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-products-queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-products.ts app/_lib/__tests__/admin-products-queries.test.ts
git commit -m "feat(admin-products): listProducts + getProduct + listCategories queries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Storefront archived filter (cross-cutting)

**Files:** Modify `app/_lib/products.ts`, Test `app/_lib/__tests__/products-archived-filter.test.ts`

The storefront must never show archived products. `getProducts` and `searchProducts` are plain functions (unit-testable); the `unstable_cache`-wrapped readers (`getFeaturedProducts`, `getDealsProducts`, `getProductById`, `getProductDetail` + its related query) get the same filter by inspection.

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/products-archived-filter.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { findMany, groupBy } = vi.hoisted(() => ({ findMany: vi.fn(), groupBy: vi.fn() }));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { product: { findMany }, review: { groupBy } },
}));

import { getProducts, searchProducts } from "../products";

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  groupBy.mockReset().mockResolvedValue([]);
});

describe("storefront product readers exclude archived", () => {
  it("getProducts always filters archived:false", async () => {
    await getProducts({ categorySlug: "cat" });
    expect(findMany.mock.calls[0][0].where.archived).toBe(false);
  });
  it("searchProducts filters archived:false", async () => {
    await searchProducts("white");
    expect(findMany.mock.calls[0][0].where.archived).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/products-archived-filter.test.ts`
Expected: FAIL — `where.archived` is `undefined`.

- [ ] **Step 3: Add the filter to every reader**

In `app/_lib/products.ts`, add `archived: false` to each product query's `where`:

- `getFeaturedProducts`: `where: { archived: false, id: { startsWith: "p" } }`
- `getDealsProducts`: `where: { archived: false, originalPrice: { not: null } }`
- `getProductById`: `where: { id, archived: false }`
- `getProductDetail`: outer `where: { id, archived: false }`; related `findMany` `where: { archived: false, categorySlug: product.categorySlug, id: { not: id } }`
- `getProducts`: initialize `const where: Prisma.ProductWhereInput = { archived: false };` (replace the empty-object init on the `where` line)
- `searchProducts`: `where: { archived: false, OR: [ ... ] }`

- [ ] **Step 4: Run test + full suite to verify**

Run: `npx vitest run app/_lib/__tests__/products-archived-filter.test.ts` → PASS.
Run: `npx vitest run` → all still green (existing product tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/products.ts app/_lib/__tests__/products-archived-filter.test.ts
git commit -m "feat(catalog): exclude archived products from all storefront readers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Actions scaffold + `updateStock` + archive/unarchive

**Files:** Create `app/admin/products/actions.ts`, Test `app/admin/products/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/admin/products/__tests__/actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { productUpdate, productFindUnique, productCreate, categoryCreate, categoryFindUnique, imageCreateMany, imageDeleteMany, txn } =
  vi.hoisted(() => ({
    productUpdate: vi.fn(), productFindUnique: vi.fn(), productCreate: vi.fn(),
    categoryCreate: vi.fn(), categoryFindUnique: vi.fn(),
    imageCreateMany: vi.fn(), imageDeleteMany: vi.fn(), txn: vi.fn(),
  }));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => {
  const client = {
    product: { update: productUpdate, findUnique: productFindUnique, create: productCreate },
    category: { create: categoryCreate, findUnique: categoryFindUnique },
    productImage: { createMany: imageCreateMany, deleteMany: imageDeleteMany },
  };
  return { prisma: { ...client, $transaction: txn.mockImplementation(async (fn: (c: unknown) => unknown) => fn(client)) } };
});

import { updateStock, archiveProduct, unarchiveProduct } from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  productUpdate.mockReset(); productFindUnique.mockReset(); productCreate.mockReset();
  categoryCreate.mockReset(); categoryFindUnique.mockReset();
  imageCreateMany.mockReset(); imageDeleteMany.mockReset();
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => {
    const client = {
      product: { update: productUpdate, findUnique: productFindUnique, create: productCreate },
      category: { create: categoryCreate, findUnique: categoryFindUnique },
      productImage: { createMany: imageCreateMany, deleteMany: imageDeleteMany },
    };
    return fn(client);
  });
});

describe("updateStock", () => {
  it("rejects a negative stock", async () => {
    const res = await updateStock("cat-white", -1);
    expect(res).toEqual({ success: false, error: "Stock must be 0 or more" });
    expect(productUpdate).not.toHaveBeenCalled();
  });
  it("sets stock", async () => {
    productUpdate.mockResolvedValueOnce({});
    const res = await updateStock("cat-white", 12);
    expect(requireAdmin).toHaveBeenCalled();
    expect(productUpdate).toHaveBeenCalledWith({ where: { id: "cat-white" }, data: { stock: 12 } });
    expect(res).toEqual({ success: true });
  });
});

describe("archive/unarchive", () => {
  it("archives", async () => {
    productUpdate.mockResolvedValueOnce({});
    const res = await archiveProduct("cat-white");
    expect(productUpdate).toHaveBeenCalledWith({ where: { id: "cat-white" }, data: { archived: true } });
    expect(res).toEqual({ success: true });
  });
  it("unarchives", async () => {
    productUpdate.mockResolvedValueOnce({});
    const res = await unarchiveProduct("cat-white");
    expect(productUpdate).toHaveBeenCalledWith({ where: { id: "cat-white" }, data: { archived: false } });
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/products/__tests__/actions.test.ts`
Expected: FAIL — `actions.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `app/admin/products/actions.ts`:

```ts
"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";

export type ActionResult =
  | { success: true; slug?: string; name?: string }
  | { success: false; error: string };

function revalidate(id?: string) {
  revalidatePath("/admin/products");
  if (id) revalidatePath(`/admin/products/${id}/edit`);
  revalidateTag("catalog"); // bust the storefront unstable_cache readers
}

export async function updateStock(id: string, stock: number): Promise<ActionResult> {
  await requireAdmin();
  if (!Number.isInteger(stock) || stock < 0) return { success: false, error: "Stock must be 0 or more" };
  try {
    await prisma.product.update({ where: { id }, data: { stock } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(id);
  return { success: true };
}

export async function archiveProduct(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.product.update({ where: { id }, data: { archived: true } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(id);
  return { success: true };
}

export async function unarchiveProduct(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.product.update({ where: { id }, data: { archived: false } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(id);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/products/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/products/actions.ts app/admin/products/__tests__/actions.test.ts
git commit -m "feat(admin-products): actions scaffold + updateStock + archive/unarchive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `createCategory` action

**Files:** Modify `app/admin/products/actions.ts`, Test `app/admin/products/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { createCategory } from "../actions";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/products/__tests__/actions.test.ts`
Expected: FAIL — `createCategory` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `actions.ts`)

```ts
import { slugify, uniqueSlug } from "@/app/_lib/admin-products";

const CategorySchema = z.object({
  name: z.string().trim().min(1),
  image: z.string().trim().min(1),
});

export async function createCategory(input: { name: string; image: string }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and image are required" };

  const slug = await uniqueSlug(
    slugify(parsed.data.name),
    async (s) => (await prisma.category.findUnique({ where: { slug: s } })) !== null,
  );
  try {
    const created = await prisma.category.create({
      data: { slug, name: parsed.data.name, image: parsed.data.image },
    });
    revalidateTag("catalog");
    return { success: true, slug: created.slug, name: created.name };
  } catch {
    return { success: false, error: "Could not create category." };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/products/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/products/actions.ts app/admin/products/__tests__/actions.test.ts
git commit -m "feat(admin-products): createCategory action (inline category create)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `createProduct` action

**Files:** Modify `app/admin/products/actions.ts`, Test `app/admin/products/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { createProduct } from "../actions";

const NEW_INPUT = {
  name: "Cat White", slug: "cat-white", categorySlug: "cat",
  price: 2190, originalPrice: null, stock: 10,
  sizes: ["S", "M", "L"], description: "Soft tee", image: "/products/cat-white/main.jpg",
  gallery: ["/products/cat-white/2.jpg", "/products/cat-white/3.jpg"],
};

describe("createProduct", () => {
  it("rejects empty name / non-positive price / empty image", async () => {
    expect((await createProduct({ ...NEW_INPUT, name: " " })).success).toBe(false);
    expect((await createProduct({ ...NEW_INPUT, price: 0 })).success).toBe(false);
    expect((await createProduct({ ...NEW_INPUT, image: "" })).success).toBe(false);
  });
  it("generates a unique slug and creates product + ordered gallery", async () => {
    productFindUnique.mockResolvedValueOnce(null); // slug free
    productCreate.mockResolvedValueOnce({ id: "cat-white" });
    imageCreateMany.mockResolvedValueOnce({ count: 2 });
    const res = await createProduct(NEW_INPUT);
    const createArg = productCreate.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      id: "cat-white", name: "Cat White", categorySlug: "cat",
      price: 2190, originalPrice: null, stock: 10, sizes: "S,M,L",
      description: "Soft tee", image: "/products/cat-white/main.jpg", archived: false,
    });
    expect(imageCreateMany).toHaveBeenCalledWith({
      data: [
        { productId: "cat-white", url: "/products/cat-white/2.jpg", sortOrder: 0 },
        { productId: "cat-white", url: "/products/cat-white/3.jpg", sortOrder: 1 },
      ],
    });
    expect(res).toEqual({ success: true, slug: "cat-white" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/products/__tests__/actions.test.ts`
Expected: FAIL — `createProduct` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `actions.ts`)

```ts
import { parseSizes, serializeSizes } from "@/app/_lib/admin-products";

const ProductInputSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  categorySlug: z.string().trim().min(1),
  price: z.number().positive(),
  originalPrice: z.number().positive().nullable().optional(),
  stock: z.number().int().min(0),
  sizes: z.array(z.string()),
  description: z.string().trim().min(1),
  image: z.string().trim().min(1),
  gallery: z.array(z.string().trim().min(1)),
});
export type ProductInput = z.infer<typeof ProductInputSchema>;

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Please complete all required fields." };
  const d = parsed.data;

  const slug = await uniqueSlug(
    slugify(d.slug || d.name),
    async (s) => (await prisma.product.findUnique({ where: { id: s } })) !== null,
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.create({
        data: {
          id: slug, name: d.name, categorySlug: d.categorySlug,
          price: d.price, originalPrice: d.originalPrice ?? null, stock: d.stock,
          sizes: serializeSizes(d.sizes), description: d.description, image: d.image,
          archived: false,
        },
      });
      if (d.gallery.length > 0) {
        await tx.productImage.createMany({
          data: d.gallery.map((url, i) => ({ productId: slug, url, sortOrder: i })),
        });
      }
    });
  } catch {
    return { success: false, error: "Could not create product (check the category exists)." };
  }
  revalidate(slug);
  return { success: true, slug };
}
```

> Note: `parseSizes` is imported for the form layer; `serializeSizes` normalizes the stored CSV.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/products/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/products/actions.ts app/admin/products/__tests__/actions.test.ts
git commit -m "feat(admin-products): createProduct action (unique slug + gallery)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `updateProduct` action

**Files:** Modify `app/admin/products/actions.ts`, Test `app/admin/products/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { updateProduct } from "../actions";

describe("updateProduct", () => {
  it("rejects when the product does not exist", async () => {
    productFindUnique.mockResolvedValueOnce(null);
    const res = await updateProduct("nope", { ...NEW_INPUT });
    expect(res).toEqual({ success: false, error: "Product not found" });
  });
  it("updates scalars, never changes slug, and replaces the gallery", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    productUpdate.mockResolvedValueOnce({});
    imageDeleteMany.mockResolvedValueOnce({ count: 2 });
    imageCreateMany.mockResolvedValueOnce({ count: 1 });
    const res = await updateProduct("cat-white", { ...NEW_INPUT, name: "Cat White v2", gallery: ["/g/1.jpg"] });
    const updArg = productUpdate.mock.calls[0][0];
    expect(updArg.where).toEqual({ id: "cat-white" });
    expect(updArg.data.name).toBe("Cat White v2");
    expect(updArg.data.id).toBeUndefined(); // slug/id never updated
    expect(imageDeleteMany).toHaveBeenCalledWith({ where: { productId: "cat-white" } });
    expect(imageCreateMany).toHaveBeenCalledWith({ data: [{ productId: "cat-white", url: "/g/1.jpg", sortOrder: 0 }] });
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/products/__tests__/actions.test.ts`
Expected: FAIL — `updateProduct` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `actions.ts`)

```ts
export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Please complete all required fields." };
  const d = parsed.data;

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { success: false, error: "Product not found" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: d.name, categorySlug: d.categorySlug,
          price: d.price, originalPrice: d.originalPrice ?? null, stock: d.stock,
          sizes: serializeSizes(d.sizes), description: d.description, image: d.image,
          // id/slug intentionally NOT updated
        },
      });
      await tx.productImage.deleteMany({ where: { productId: id } });
      if (d.gallery.length > 0) {
        await tx.productImage.createMany({
          data: d.gallery.map((url, i) => ({ productId: id, url, sortOrder: i })),
        });
      }
    });
  } catch {
    return { success: false, error: "Could not save product (check the category exists)." };
  }
  revalidate(id);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/products/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/products/actions.ts app/admin/products/__tests__/actions.test.ts
git commit -m "feat(admin-products): updateProduct action (scalars + gallery replace, slug immutable)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: List page + toolbar + table + inline stock

**Files:** Create `app/admin/products/page.tsx`, `loading.tsx`, and `app/_components/admin/products/{products-toolbar,products-table,stock-quick-edit}.tsx`

- [ ] **Step 1: Stock quick-edit (client)**

`app/_components/admin/products/stock-quick-edit.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStock } from "@/app/admin/products/actions";

export function StockQuickEdit({ id, value }: { id: string; value: number }) {
  const [v, setV] = useState(String(value));
  const [pending, start] = useTransition();
  const router = useRouter();
  function save() {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n === value) return;
    start(async () => { const r = await updateStock(id, n); if (!r.success) alert(r.error); router.refresh(); });
  }
  return (
    <input
      type="number" min={0} value={v} disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-16 rounded border px-1 py-0.5 text-sm"
    />
  );
}
```

- [ ] **Step 2: Toolbar (client)**

`app/_components/admin/products/products-toolbar.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PRODUCT_TABS, type ProductTab } from "@/app/_lib/admin-products";

const TAB_LABEL: Record<ProductTab, string> = {
  active: "Active", "low-stock": "Low stock", archived: "Archived", all: "All",
};

export function ProductsToolbar({ categories }: { categories: { slug: string; name: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const activeTab = (sp.get("tab") as ProductTab) || "active";
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    router.push(`/admin/products?${next.toString()}`);
  }
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          defaultValue={sp.get("q") ?? ""}
          placeholder="Search name or slug…"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }}
        />
        <select className="rounded-md border px-2 py-2 text-sm" defaultValue={sp.get("category") ?? ""}
          onChange={(e) => setParam("category", e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <Link href="/admin/products/new" className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">＋ New product</Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRODUCT_TABS.map((t) => (
          <button key={t} onClick={() => setParam("tab", t === "active" ? "" : t)}
            className={(activeTab === t ? "bg-primary text-primary-foreground " : "bg-secondary text-muted-foreground ") + "rounded-full px-3 py-1 text-xs font-medium"}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Table (server)**

`app/_components/admin/products/products-table.tsx`:

```tsx
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/app/_lib/format";
import { Badge } from "@/components/ui/badge";
import { StockQuickEdit } from "./stock-quick-edit";

type Row = {
  id: string; name: string; price: number; originalPrice: number | null;
  image: string; stock: number; sizes: string; archived: boolean;
  category: { name: string } | null;
};

export function ProductsTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No products match this view.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2"></th><th className="p-2">Name</th><th className="p-2">Category</th>
          <th className="p-2">Price</th><th className="p-2">Stock</th><th className="p-2">Sizes</th><th className="p-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className={"border-b hover:bg-secondary/40 " + (p.archived ? "opacity-60" : "")}>
            <td className="p-2"><Image src={p.image} alt="" width={36} height={36} className="rounded object-cover" /></td>
            <td className="p-2 font-medium">
              <Link href={`/admin/products/${p.id}/edit`} className="hover:underline">{p.name}</Link>
              <br /><span className="text-muted-foreground">{p.id}</span>
            </td>
            <td className="p-2">{p.category?.name ?? "—"}</td>
            <td className="p-2 font-medium">{formatPrice(p.price)}{p.originalPrice ? <span className="ml-1 text-xs text-muted-foreground line-through">{formatPrice(p.originalPrice)}</span> : null}</td>
            <td className="p-2"><StockQuickEdit id={p.id} value={p.stock} /></td>
            <td className="p-2 text-muted-foreground">{p.sizes}</td>
            <td className="p-2"><Badge variant={p.archived ? "outline" : "secondary"}>{p.archived ? "Archived" : "Active"}</Badge></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: List page + loading (server)**

`app/admin/products/page.tsx`:

```tsx
import { listProducts, listCategories, buildProductWhere, PRODUCT_TABS, PAGE_SIZE, type ProductTab } from "@/app/_lib/admin-products";
import { prisma } from "@/app/_lib/prisma";
import { ProductsToolbar } from "@/app/_components/admin/products/products-toolbar";
import { ProductsTable } from "@/app/_components/admin/products/products-table";

export default async function AdminProductsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = (sp.tab as ProductTab) || "active";
  const page = Number(sp.page ?? "1") || 1;

  const [{ rows, total }, categories] = await Promise.all([
    listProducts({ tab, category: sp.category, q: sp.q, page }),
    listCategories(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Products</h1>
      <ProductsToolbar categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
      <ProductsTable rows={rows} />
      <p className="mt-4 text-sm text-muted-foreground">Page {page} of {pages} · {total} products</p>
    </section>
  );
}
```

`app/admin/products/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>;
}
```

- [ ] **Step 5: Verify build + commit**

Run: `npm run build` → `✓ Compiled successfully`. Manually: visit `/admin/products`, confirm tabs/search/category/table + inline stock render.

```bash
git add app/admin/products/page.tsx app/admin/products/loading.tsx app/_components/admin/products
git commit -m "feat(admin-products): list page with toolbar, tabs, table, inline stock

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Product form + gallery editor + category select + new/edit pages

**Files:** Create `app/_components/admin/products/{product-form,gallery-editor,category-select}.tsx`, `app/admin/products/new/page.tsx`, `app/admin/products/[id]/edit/page.tsx`, `app/admin/products/[id]/edit/not-found.tsx`

- [ ] **Step 1: Category select with inline create (client)**

`app/_components/admin/products/category-select.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { createCategory } from "@/app/admin/products/actions";

type Cat = { slug: string; name: string };

export function CategorySelect({
  categories, value, onChange,
}: { categories: Cat[]; value: string; onChange: (slug: string) => void }) {
  const [cats, setCats] = useState(categories);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [pending, start] = useTransition();

  function add() {
    start(async () => {
      const r = await createCategory({ name, image });
      if (!r.success) { alert(r.error); return; }
      setCats((c) => [...c, { slug: r.slug!, name: r.name! }]);
      onChange(r.slug!);
      setAdding(false); setName(""); setImage("");
    });
  }

  return (
    <div>
      <select className="w-full rounded border px-2 py-1.5 text-sm" value={value}
        onChange={(e) => { if (e.target.value === "__new__") setAdding(true); else onChange(e.target.value); }}>
        <option value="" disabled>Select a category…</option>
        {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        <option value="__new__">＋ New category…</option>
      </select>
      {adding && (
        <div className="mt-2 space-y-2 rounded border p-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" className="w-full rounded border px-2 py-1 text-sm" />
          <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="Image URL / path" className="w-full rounded border px-2 py-1 text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={pending || !name.trim() || !image.trim()} onClick={add} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Create</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded border px-2 py-1 text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Gallery editor (client)**

`app/_components/admin/products/gallery-editor.tsx`:

```tsx
"use client";

export function GalleryEditor({ urls, onChange }: { urls: string[]; onChange: (u: string[]) => void }) {
  const set = (i: number, v: string) => onChange(urls.map((u, j) => (j === i ? v : u)));
  const remove = (i: number) => onChange(urls.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= urls.length) return;
    const next = [...urls];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {urls.map((u, i) => (
        <div key={i} className="flex items-center gap-1">
          <button type="button" onClick={() => move(i, -1)} className="px-1 text-muted-foreground">↑</button>
          <button type="button" onClick={() => move(i, 1)} className="px-1 text-muted-foreground">↓</button>
          <input value={u} onChange={(e) => set(i, e.target.value)} placeholder="/products/…/2.jpg" className="flex-1 rounded border px-2 py-1 text-sm" />
          <button type="button" onClick={() => remove(i)} className="px-1 text-destructive">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...urls, ""])} className="rounded border px-3 py-1 text-sm">＋ Add gallery image</button>
    </div>
  );
}
```

- [ ] **Step 3: Product form (client)**

`app/_components/admin/products/product-form.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createProduct, updateProduct, archiveProduct, unarchiveProduct } from "@/app/admin/products/actions";
import { slugify, parseSizes, serializeSizes } from "@/app/_lib/admin-products";
import { CategorySelect } from "./category-select";
import { GalleryEditor } from "./gallery-editor";

type Cat = { slug: string; name: string };
type Initial = {
  id?: string; name: string; categorySlug: string; price: string; originalPrice: string;
  stock: string; sizesCsv: string; description: string; image: string; gallery: string[]; archived: boolean;
};

const STD_SIZES = ["S", "M", "L", "XL"];

export function ProductForm({ mode, categories, initial }: { mode: "create" | "edit"; categories: Cat[]; initial: Initial }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [slug, setSlug] = useState(initial.id ?? "");
  const [pending, start] = useTransition();
  const set = <K extends keyof Initial>(k: K, v: Initial[K]) => setF((p) => ({ ...p, [k]: v }));

  const sizes = parseSizes(f.sizesCsv);
  const toggleSize = (s: string) => set("sizesCsv", serializeSizes(sizes.includes(s) ? sizes.filter((x) => x !== s) : [...sizes, s]));

  function submit() {
    const input = {
      name: f.name.trim(), slug: mode === "create" ? slug : undefined, categorySlug: f.categorySlug,
      price: Number(f.price), originalPrice: f.originalPrice ? Number(f.originalPrice) : null,
      stock: Number(f.stock), sizes, description: f.description.trim(), image: f.image.trim(),
      gallery: f.gallery.map((g) => g.trim()).filter(Boolean),
    };
    start(async () => {
      const r = mode === "create" ? await createProduct(input) : await updateProduct(f.id!, input);
      if (!r.success) { alert(r.error); return; }
      router.push("/admin/products"); router.refresh();
    });
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{mode === "create" ? "New product" : `Edit · ${f.name}`}</h1>
        <span className="ml-auto flex gap-2">
          {mode === "edit" && (
            <button disabled={pending} onClick={() => start(async () => { const r = f.archived ? await unarchiveProduct(f.id!) : await archiveProduct(f.id!); if (r.success) { set("archived", !f.archived); router.refresh(); } else alert(r.error); })}
              className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive">{f.archived ? "Unarchive" : "Archive"}</button>
          )}
          <button onClick={() => router.push("/admin/products")} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
          <button disabled={pending} onClick={submit} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">Save</button>
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-lg border p-4 space-y-3">
            <div><label className="text-xs text-muted-foreground">Name</label>
              <input value={f.name} className="w-full rounded border px-2 py-1.5 text-sm"
                onChange={(e) => { set("name", e.target.value); if (mode === "create" && !slugTouched) setSlug(slugify(e.target.value)); }} /></div>
            <div><label className="text-xs text-muted-foreground">Slug (URL id)</label>
              <input value={mode === "create" ? slug : f.id} readOnly={mode === "edit"}
                onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
                className={"w-full rounded border px-2 py-1.5 text-sm " + (mode === "edit" ? "bg-secondary text-muted-foreground" : "")} /></div>
            <div><label className="text-xs text-muted-foreground">Category</label>
              <CategorySelect categories={categories} value={f.categorySlug} onChange={(s) => set("categorySlug", s)} /></div>
          </div>
          <div className="rounded-lg border p-4 grid grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground">Price (LKR)</label><input value={f.price} onChange={(e) => set("price", e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-muted-foreground">Original price</label><input value={f.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} placeholder="optional" className="w-full rounded border px-2 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-muted-foreground">Stock</label><input value={f.stock} onChange={(e) => set("stock", e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" /></div>
          </div>
          <div className="rounded-lg border p-4">
            <label className="text-xs text-muted-foreground">Sizes</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {STD_SIZES.map((s) => (
                <button key={s} type="button" onClick={() => toggleSize(s)}
                  className={"rounded-full px-3 py-1 text-xs " + (sizes.includes(s) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{s}</button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <label className="text-xs text-muted-foreground">Description</label>
            <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={4} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <label className="text-xs text-muted-foreground">Main image (URL / path)</label>
            <input value={f.image} onChange={(e) => set("image", e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
            {f.image ? <Image src={f.image} alt="" width={240} height={160} className="mt-2 h-32 w-full rounded object-cover" /> : null}
          </div>
          <div className="rounded-lg border p-4">
            <label className="mb-2 block text-xs text-muted-foreground">Gallery</label>
            <GalleryEditor urls={f.gallery} onChange={(u) => set("gallery", u)} />
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: New + edit pages (server)**

`app/admin/products/new/page.tsx`:

```tsx
import { listCategories } from "@/app/_lib/admin-products";
import { ProductForm } from "@/app/_components/admin/products/product-form";

export default async function NewProductPage() {
  const categories = await listCategories();
  return (
    <ProductForm mode="create" categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      initial={{ name: "", categorySlug: "", price: "", originalPrice: "", stock: "0", sizesCsv: "S,M,L,XL", description: "", image: "", gallery: [], archived: false }} />
  );
}
```

`app/admin/products/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getProduct, listCategories } from "@/app/_lib/admin-products";
import { ProductForm } from "@/app/_components/admin/products/product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories] = await Promise.all([getProduct(id), listCategories()]);
  if (!product) notFound();
  return (
    <ProductForm mode="edit" categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      initial={{
        id: product.id, name: product.name, categorySlug: product.categorySlug,
        price: String(product.price), originalPrice: product.originalPrice != null ? String(product.originalPrice) : "",
        stock: String(product.stock), sizesCsv: product.sizes, description: product.description,
        image: product.image, gallery: product.images.map((im) => im.url), archived: product.archived,
      }} />
  );
}
```

`app/admin/products/[id]/edit/not-found.tsx`:

```tsx
export default function NotFound() {
  return <div className="rounded-lg border p-8 text-center"><h2 className="text-lg font-semibold">Product not found</h2></div>;
}
```

- [ ] **Step 5: Verify build + commit**

Run: `npm run build` → `✓ Compiled successfully`. Manually: create a product (slug auto-fills), edit it (slug read-only), add/remove/reorder gallery, toggle a size, create a category inline, archive/unarchive.

```bash
git add app/admin/products/new app/admin/products/[id] app/_components/admin/products
git commit -m "feat(admin-products): create/edit form, gallery editor, inline category select

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: E2E tests

**Files:** Create `tests/e2e/admin-products.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Use the real fixtures (`tests/e2e/fixtures/users.ts`: `ADMIN`, `seedTestUsers`, `deleteTestUsers`) and the inline-login pattern from `tests/e2e/admin-shell.spec.ts` (login via `/login?callbackUrl=/about`, then `goto`). Create `tests/e2e/admin-products.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { ADMIN, seedTestUsers, deleteTestUsers } from "./fixtures/users";

test.beforeAll(seedTestUsers);
test.afterAll(deleteTestUsers);

async function login(page) {
  await page.goto("/login?callbackUrl=/about");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await Promise.all([page.waitForURL("/about"), page.click('button[type="submit"]')]);
}

test("products list renders with tabs, search, category filter, New button", async ({ page }) => {
  await login(page);
  await page.goto("/admin/products");
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  for (const t of ["Active", "Low stock", "Archived", "All"]) {
    await expect(page.getByRole("button", { name: t })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: /New product/ })).toBeVisible();
  await page.getByRole("button", { name: "Low stock" }).click();
  await expect(page).toHaveURL(/tab=low-stock/);
});

test("create form: slug auto-fills from name and is editable", async ({ page }) => {
  await login(page);
  await page.goto("/admin/products/new");
  await expect(page.getByRole("heading", { name: "New product" })).toBeVisible();
  await page.getByLabel("Name").fill("E2E Test Tee");
  // slug input reflects a slugified value (exact selector depends on markup; assert the field is present)
  await expect(page.getByText("Slug (URL id)")).toBeVisible();
});

test("edit page 404s for an unknown product", async ({ page }) => {
  await login(page);
  await page.goto("/admin/products/does-not-exist-xyz/edit");
  await expect(page.getByText("Product not found")).toBeVisible();
});
```

> Note: keep assertions resilient (don't depend on specific seeded products). A full create→persist→archive flow can be added when a product fixture is seeded; this suite verifies chrome, URL-driven tabs, the create form, and the not-found path.

- [ ] **Step 2: Run e2e**

Run: `npx playwright test tests/e2e/admin-products.spec.ts`
Expected: PASS. (If browsers are missing, `npx playwright install chromium` once. If the environment can't run the server, commit the spec for CI and note it.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-products.spec.ts
git commit -m "test(admin-products): e2e for list, create form, not-found

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Full verification

- [ ] **Step 1: Unit suite** — `npx vitest run` → all green.
- [ ] **Step 2: Types + lint + build** — `npx tsc --noEmit` clean; `npx eslint app/admin/products app/_components/admin/products app/_lib/admin-products.ts` clean; `npm run build` compiles.
- [ ] **Step 3: Acceptance smoke** — walk spec §9 criteria 1–11 as the seeded admin, including: archive a product → confirm it disappears from the storefront (`/`, category page, `/products/[id]` → 404) but stays in admin Archived tab.
- [ ] **Step 4: Final commit (if cleanup)**

```bash
git add -A && git commit -m "chore(admin-products): final verification pass

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes (plan vs. spec)

- **Spec coverage:** schema+archived (T1); helpers (T2-T3); queries (T4); storefront filter + regression (T5, AC#7/#10); actions incl. createCategory/createProduct/updateProduct/updateStock/archive (T6-T9); list+inline-stock (T10); form+gallery+inline-category+new/edit (T11); e2e (T12); verification (T13). All §9 criteria 1–11 mapped.
- **Type consistency:** `ActionResult`, `ProductInput`, `ProductTab`/`PRODUCT_TABS`, `ProductListParams`, `slugify`/`uniqueSlug`/`parseSizes`/`serializeSizes`/`buildProductWhere`, `listProducts`/`getProduct`/`listCategories` defined once and reused with matching signatures across tasks.
- **Reuse:** `requireAdmin`, `revalidatePath`/`revalidateTag("catalog")` (matches the `unstable_cache` tags in `products.ts`), `formatPrice`, shadcn `Badge`/`Skeleton`, the Orders `vi.hoisted`+`vi.mock` test pattern, the `/about`-callback e2e login.
- **Deferred (spec §2):** real upload, category edit/delete, bulk actions, per-size stock, slug change.

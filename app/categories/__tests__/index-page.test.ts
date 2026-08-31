import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

// BLOCKER 2 — /categories must not link to departments that hold no designs.
// scripts/deploy.sh runs `prisma migrate deploy` and never seeds, so on a fresh
// production database the migration's four departments exist but only the two
// shipped designs do (both under `women`). Linking to the other three would
// advertise indexable "Nothing here yet." pages.

const { getDepartments, getProducts } = vi.hoisted(() => ({
  getDepartments: vi.fn(),
  getProducts: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
// Keep the real showsNavDropdown — the point of this test is that the page
// routes its department lists through the spec's derived rule.
vi.mock("@/app/_lib/taxonomy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/_lib/taxonomy")>()),
  getDepartments,
}));
vi.mock("@/app/_lib/products", () => ({
  getProducts,
  parseSortBy: (_v: string | undefined, fallback: string) => fallback,
}));
vi.mock("@/app/_components/home/product-card", () => ({ ProductCard: () => null }));
vi.mock("@/app/_components/home/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/app/_components/home/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/app/_components/shared/sort-select", () => ({ SortSelect: () => null }));

import CategoriesPage from "../(index)/page";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [],
  ...over,
});

/** Walk the returned element tree and collect every `href` prop. */
function collectHrefs(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectHrefs(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) {
    if (typeof props.href === "string") out.push(props.href);
    collectHrefs(props.children, out);
  }
  return out;
}

beforeEach(() => {
  getProducts.mockReset().mockResolvedValue([]);
  getDepartments.mockReset();
});

describe("/categories department lists", () => {
  it("omits departments that have no designs, in both the tile row and the sidebar", async () => {
    getDepartments.mockResolvedValue([
      dept({
        slug: "women", name: "Women", sortOrder: 1,
        designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4" }],
      }),
      dept({ slug: "men", name: "Men", sortOrder: 0, designs: [] }),
      dept({ slug: "plain", name: "Plain T-Shirts (Unisex)", subName: null, sortOrder: 2, designs: [] }),
      dept({ slug: "accessories", name: "Accessories", subName: null, sortOrder: 3, designs: [] }),
    ]);

    const tree = await CategoriesPage({ searchParams: Promise.resolve({}) });
    const hrefs = collectHrefs(tree);

    // Women has a design, so it is linked — once from the tile row, once from
    // the sidebar list.
    expect(hrefs.filter((h) => h === "/categories/women")).toHaveLength(2);
    expect(hrefs).toContain("/categories/women/cat");

    // The three empty departments are not linked from anywhere on the page.
    expect(hrefs).not.toContain("/categories/men");
    expect(hrefs).not.toContain("/categories/plain");
    expect(hrefs).not.toContain("/categories/accessories");
  });

  it("links every department once designs exist under each", async () => {
    getDepartments.mockResolvedValue([
      dept({ slug: "women", designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4" }] }),
      dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#C4D3EF" }] }),
    ]);

    const hrefs = collectHrefs(await CategoriesPage({ searchParams: Promise.resolve({}) }));

    expect(hrefs).toContain("/categories/women");
    expect(hrefs).toContain("/categories/men");
    expect(hrefs).toContain("/categories/men/car");
  });
});

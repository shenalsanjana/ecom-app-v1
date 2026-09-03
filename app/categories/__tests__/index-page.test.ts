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
import { FilterRail } from "@/app/_components/categories/filter-rail";
import { FilterDisclosure } from "@/app/_components/categories/filter-disclosure";

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

/** The sidebar's links live inside FilterRail, and a tree walk does not enter
 *  child components — so they never appear in the page's own tree. Read the
 *  departments the page hands the rail from its props instead;
 *  filter-tree.test.ts proves the rail's tree links every one it is given. */
function filterRailDepartments(node: unknown): { slug: string }[] | null {
  if (node === null || node === undefined || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = filterRailDepartments(child);
      if (found) return found;
    }
    return null;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === FilterRail) return el.props?.departments as { slug: string }[];
  return el.props ? filterRailDepartments(el.props.children) : null;
}

/** One prop off the FilterDisclosure the page renders. */
function disclosureProp(node: unknown, name: string): unknown {
  if (node === null || node === undefined || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = disclosureProp(child, name);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === FilterDisclosure) return el.props?.[name];
  return el.props ? disclosureProp(el.props.children, name) : undefined;
}

beforeEach(() => {
  getProducts.mockReset().mockResolvedValue([]);
  getDepartments.mockReset();
});

describe("/categories department lists", () => {
  it("omits departments that have no designs from the browse rail", async () => {
    getDepartments.mockResolvedValue([
      dept({
        slug: "women", name: "Women", sortOrder: 1,
        designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }],
      }),
      dept({ slug: "men", name: "Men", sortOrder: 0, designs: [] }),
      dept({ slug: "plain", name: "Plain T-Shirts (Unisex)", subName: null, sortOrder: 2, designs: [] }),
      dept({ slug: "accessories", name: "Accessories", subName: null, sortOrder: 3, designs: [] }),
    ]);

    const tree = await CategoriesPage({ searchParams: Promise.resolve({}) });

    // The rail is only ever handed the departments that survive
    // showsNavDropdown, so the three empty ones are unreachable from here.
    expect(filterRailDepartments(tree)?.map((d) => d.slug)).toEqual(["women"]);

    // And the page itself links no department directly.
    const hrefs = collectHrefs(tree);
    expect(hrefs).not.toContain("/categories/men");
    expect(hrefs).not.toContain("/categories/plain");
    expect(hrefs).not.toContain("/categories/accessories");
  });

  it("hands the rail every department once designs exist under each", async () => {
    getDepartments.mockResolvedValue([
      dept({ slug: "women", designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }] }),
      dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#C4D3EF", image: null }] }),
    ]);

    const tree = await CategoriesPage({ searchParams: Promise.resolve({}) });

    expect(filterRailDepartments(tree)?.map((d) => d.slug)).toEqual(["women", "men"]);
  });
});

describe("/categories filters", () => {
  beforeEach(() => {
    getDepartments.mockResolvedValue([
      dept({ slug: "women", designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }] }),
    ]);
  });

  it("sends the price and stock filters to the query, and never narrows the counts read", async () => {
    await CategoriesPage({
      searchParams: Promise.resolve({ minPrice: "1000", maxPrice: "4500", inStockOnly: "true" }),
    });

    // First read is the whole catalogue — the sidebar counts must not move
    // when a filter is applied.
    expect(getProducts).toHaveBeenNthCalledWith(1, { sortBy: "newest" });
    expect(getProducts).toHaveBeenNthCalledWith(2, {
      sortBy: "newest",
      designSlug: undefined,
      minPrice: 1000,
      maxPrice: 4500,
      inStockOnly: true,
    });
  });

  it("counts what is applied for the collapsed Filters button, ignoring sort", async () => {
    // Sort reorders, it never hides — counting it would tell a phone that a
    // filter is on when nothing is being held back.
    const tree = await CategoriesPage({
      searchParams: Promise.resolve({
        category: "cat", minPrice: "1000", inStockOnly: "true", sort: "rating",
      }),
    });
    expect(disclosureProp(tree, "activeCount")).toBe(3);
  });

  it("counts nothing when the page is unfiltered", async () => {
    const tree = await CategoriesPage({ searchParams: Promise.resolve({ sort: "rating" }) });
    expect(disclosureProp(tree, "activeCount")).toBe(0);
  });

  it("ignores a price that is not a number rather than passing NaN to the query", async () => {
    await CategoriesPage({ searchParams: Promise.resolve({ minPrice: "abc" }) });
    // Nothing is being filtered, so the catalogue read is the only read.
    expect(getProducts).toHaveBeenCalledTimes(1);
    expect(getProducts).toHaveBeenCalledWith({ sortBy: "newest" });
  });
});

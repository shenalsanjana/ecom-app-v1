import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

// The home page IS the shop-all catalogue. This file is the old
// app/categories/__tests__/index-page.test.ts — every browse behaviour it
// guarded still applies, it just applies to "/" now — plus the composition
// checks that used to live here.
//
// BLOCKER 2 (carried over) — the catalogue must not link to departments that
// hold no designs. scripts/deploy.sh runs `prisma migrate deploy` and never
// seeds, so on a fresh production database the migration's four departments
// exist but only the two shipped designs do (both under `women`). Linking to
// the other three would advertise indexable "Nothing here yet." pages.

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
// Both hit the database; this file is about the catalogue and the page's
// composition, so they are stubbed to identity-only placeholders.
vi.mock("@/app/_components/home/deals-section", () => ({ DealsSection: () => null }));
vi.mock("@/app/_components/home/trust-strip", () => ({ TrustStrip: () => null }));

import Home from "../(home)/page";
import { BrandBand } from "@/app/_components/home/brand-band";
import { FilterRail } from "@/app/_components/categories/filter-rail";
import { FilterDisclosure } from "@/app/_components/categories/filter-disclosure";
import { DealsSection } from "@/app/_components/home/deals-section";
import { TrustStrip } from "@/app/_components/home/trust-strip";
import { ProductCard } from "@/app/_components/home/product-card";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [],
  ...over,
});

const product = (id: string) => ({ id, name: id, slug: id });

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

/** Every element in the tree, depth-first, in render order. */
function collectElements(
  node: unknown,
  out: { type: unknown; props: Record<string, unknown> }[] = [],
): { type: unknown; props: Record<string, unknown> }[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, out);
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.props) {
    out.push({ type: el.type, props: el.props });
    collectElements(el.props.children, out);
  }
  return out;
}

/** The first element of a given component type, or undefined. */
function find(tree: unknown, type: unknown) {
  return collectElements(tree).find((e) => e.type === type);
}

/** The sidebar's links live inside FilterRail, and a tree walk does not enter
 *  child components — so they never appear in the page's own tree. Read the
 *  departments the page hands the rail from its props instead;
 *  filter-tree.test.ts proves the rail's tree links every one it is given. */
function filterRailDepartments(tree: unknown): { slug: string }[] | undefined {
  return find(tree, FilterRail)?.props.departments as { slug: string }[] | undefined;
}

const render = (searchParams: Record<string, string> = {}) =>
  Home({ searchParams: Promise.resolve(searchParams) });

beforeEach(() => {
  getProducts.mockReset().mockResolvedValue([]);
  getDepartments.mockReset().mockResolvedValue([
    dept({ slug: "women", designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }] }),
  ]);
});

describe("home page composition", () => {
  it("puts the catalogue above deals and trust, so products come first", async () => {
    getProducts.mockResolvedValue([product("p1")]);
    const tree = await render();
    const types = collectElements(tree).map((e) => e.type);

    // The band opens <main>: nothing stands between the header and it, which
    // is the whole point of dropping the photo hero.
    const main = collectElements(tree).find((e) => e.type === "main");
    expect(collectElements(main?.props.children)[0]?.type).toBe(BrandBand);

    const band = types.indexOf(BrandBand);
    const card = types.indexOf(ProductCard);
    const deals = types.indexOf(DealsSection);
    const trust = types.indexOf(TrustStrip);

    expect(card).toBeGreaterThan(band);
    expect(deals).toBeGreaterThan(card);
    expect(trust).toBeGreaterThan(deals);
  });

  it("carries no second <h1>, because BrandBand holds the page's only one", async () => {
    // The band renders the heading it is handed. A heading in the catalogue
    // below it — where "All products" used to sit — would be a second h1.
    const headings = collectElements(await render()).filter((e) => e.type === "h1");
    expect(headings).toHaveLength(0);
    expect(find(await render(), BrandBand)).toBeDefined();
  });

  it("names the whole catalogue in the band, with the brand line beside it", async () => {
    const band = find(await render(), BrandBand);
    expect(band?.props.heading).toBe("The whole rack");
    expect(band?.props.blurb).toEqual(expect.stringContaining("Oversize graphic tees"));
  });

  it("swaps the heading for the design and drops the blurb once a filter is on", async () => {
    // The blurb describes the whole catalogue; on a narrowed page it would be
    // describing something the grid is no longer showing.
    const band = find(await render({ category: "cat" }), BrandBand);
    expect(band?.props.heading).toBe("Cats");
    expect(band?.props.blurb).toBeNull();
  });

  it("falls back to a generic heading for a category slug that no longer exists", async () => {
    const band = find(await render({ category: "ghost" }), BrandBand);
    expect(band?.props.heading).toBe("Category");
  });
});

describe("home page department lists", () => {
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

    const tree = await render();

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

    expect(filterRailDepartments(await render())?.map((d) => d.slug)).toEqual(["women", "men"]);
  });
});

describe("home page filters", () => {
  it("sends the price and stock filters to the query, and never narrows the counts read", async () => {
    await render({ minPrice: "1000", maxPrice: "4500", inStockOnly: "true" });

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
    const tree = await render({
      category: "cat", minPrice: "1000", inStockOnly: "true", sort: "rating",
    });
    expect(find(tree, FilterDisclosure)?.props.activeCount).toBe(3);
  });

  it("counts nothing when the page is unfiltered", async () => {
    expect(find(await render({ sort: "rating" }), FilterDisclosure)?.props.activeCount).toBe(0);
  });

  it("ignores a price that is not a number rather than passing NaN to the query", async () => {
    await render({ minPrice: "abc" });
    // Nothing is being filtered, so the catalogue read is the only read.
    expect(getProducts).toHaveBeenCalledTimes(1);
    expect(getProducts).toHaveBeenCalledWith({ sortBy: "newest" });
  });
});

describe("home page links", () => {
  it("keeps every catalogue link on '/', so nothing points back at /categories", async () => {
    // /categories 308s here (next.config.ts). A link from this page to it would
    // cost a redirect hop on every filter and page click.
    getProducts.mockResolvedValue(Array.from({ length: 30 }, (_, i) => product(`p${i}`)));
    const hrefs = collectHrefs(await render({ category: "cat", minPrice: "1000" }));

    expect(hrefs).not.toContain("/categories");
    expect(hrefs.filter((h) => h.startsWith("/categories?"))).toEqual([]);
    // Pagination is rendered here, so it lands in the walk...
    expect(hrefs).toContain("/?category=cat&minPrice=1000&page=2");
    // ...while the rail's "All products" target is a prop on a child
    // component, which the walk does not enter. Read it off the props.
    expect(find(await render({ category: "cat", minPrice: "1000" }), FilterRail)?.props.allHref)
      .toBe("/?minPrice=1000");
  });

  it("offers a bare '/' as the way out when filters match nothing", async () => {
    getProducts.mockResolvedValueOnce([product("p1")]).mockResolvedValueOnce([]);
    const tree = await render({ category: "cat" });

    expect(find(tree, FilterRail)?.props.clearHref).toBe("/");
    expect(collectHrefs(tree)).toContain("/");
  });
});

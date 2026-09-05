import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

// The shop-all catalogue at /categories. It briefly lived at "/" and this file
// briefly lived at app/__tests__/home-page.test.ts; the page is back here, and
// "/" is the marketing home again (see app/__tests__/home-page.test.ts).
//
// The browse layout itself lives in CatalogueBrowser, shared with the
// department pages, and has its own test. A tree walk does not enter a child
// component, so what this file checks is the contract between the two: the
// page reads the right things and hands the browser the right props.
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
  // Mirrors the real parseSortBy rather than always returning the fallback:
  // which value comes back decides what the page serialises into its links, so
  // a stub that swallowed ?sort= would make those assertions vacuous. The real
  // one cannot be reused here — products.ts imports Prisma at module scope.
  parseSortBy: (v: string | undefined, fallback: string) =>
    v && ["name", "price_asc", "price_desc", "rating", "newest"].includes(v) ? v : fallback,
}));
// Imported for identity comparison only, but importing CatalogueBrowser runs
// its import chain — ProductCard reaches next-auth through the session hooks.
vi.mock("@/app/_components/home/product-card", () => ({ ProductCard: () => null }));
vi.mock("@/app/_components/shared/sort-select", () => ({ SortSelect: () => null }));
vi.mock("@/app/_components/home/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/app/_components/home/site-footer", () => ({ SiteFooter: () => null }));
// Both hit the database; this file is about the catalogue and the page's
// composition, so they are stubbed to identity-only placeholders.
vi.mock("@/app/_components/home/deals-section", () => ({ DealsSection: () => null }));
vi.mock("@/app/_components/home/trust-strip", () => ({ TrustStrip: () => null }));

import CataloguePage from "../(index)/page";
import { OfferBanner } from "@/app/_components/home/offer-banner";
import { CatalogueBrowser } from "@/app/_components/catalogue/catalogue-browser";
import { DealsSection } from "@/app/_components/home/deals-section";
import { TrustStrip } from "@/app/_components/home/trust-strip";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [],
  ...over,
});

const product = (id: string, variants: { price: number; originalPrice: number | null }[] = []) =>
  ({ id, name: id, slug: id, variants });

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

/** The props the page hands the shared browse layout. */
const browser = (tree: unknown) => find(tree, CatalogueBrowser)?.props;

const render = (searchParams: Record<string, string> = {}) =>
  CataloguePage({ searchParams: Promise.resolve(searchParams) });

beforeEach(() => {
  getProducts.mockReset().mockResolvedValue([]);
  getDepartments.mockReset().mockResolvedValue([
    dept({ slug: "women", designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }] }),
  ]);
});

describe("catalogue page composition", () => {
  it("puts the catalogue above deals and trust, so products come first", async () => {
    const tree = await render();
    const types = collectElements(tree).map((e) => e.type);

    // The band opens <main>: nothing stands between the header and it, which
    // is the whole point of dropping the photo hero.
    const main = collectElements(tree).find((e) => e.type === "main");
    expect(collectElements(main?.props.children)[0]?.type).toBe(OfferBanner);

    const band = types.indexOf(OfferBanner);
    const grid = types.indexOf(CatalogueBrowser);
    const deals = types.indexOf(DealsSection);
    const trust = types.indexOf(TrustStrip);

    expect(grid).toBeGreaterThan(band);
    expect(deals).toBeGreaterThan(grid);
    expect(trust).toBeGreaterThan(deals);
  });

  it("carries no second <h1>, because OfferBanner holds the page's only one", async () => {
    const headings = collectElements(await render()).filter((e) => e.type === "h1");
    expect(headings).toHaveLength(0);
    expect(find(await render(), OfferBanner)).toBeDefined();
  });

  it("names the whole catalogue in the band, with the brand line beside it", async () => {
    const band = find(await render(), OfferBanner);
    expect(band?.props.heading).toBe("The whole rack");
    expect(band?.props.blurb).toEqual(expect.stringContaining("Oversize graphic tees"));
  });

  it("swaps the heading for the design and drops the blurb once a filter is on", async () => {
    // The blurb describes the whole catalogue; on a narrowed page it would be
    // describing something the grid is no longer showing.
    const band = find(await render({ category: "cat" }), OfferBanner);
    expect(band?.props.heading).toBe("Cats");
    expect(band?.props.blurb).toBeNull();
  });

  it("falls back to a generic heading for a category slug that no longer exists", async () => {
    expect(find(await render({ category: "ghost" }), OfferBanner)?.props.heading).toBe("Category");
  });
});

describe("catalogue page offer banner", () => {
  it("takes the headline discount from the whole catalogue, not the filtered list", async () => {
    // The banner advertises the shop. Narrowing to one design must not shrink
    // the figure it prints, so it has to read the unfiltered catalogue.
    const catalogue = [
      product("p1", [{ price: 800, originalPrice: 1000 }]),   // 20%
      product("p2", [{ price: 1200, originalPrice: 2000 }]),  // 40%
    ];
    getProducts.mockReset()
      .mockResolvedValueOnce(catalogue)                        // the counts read
      .mockResolvedValueOnce([catalogue[0]]);                  // the filtered read

    expect(find(await render({ category: "cat" }), OfferBanner)?.props.offer)
      .toEqual({ pct: 40, count: 2 });
  });

  it("tells the banner nothing is reduced when nothing is", async () => {
    // OfferBanner drops the whole panel on pct 0 rather than printing an empty
    // sale — and the page must never invent a figure to avoid that.
    getProducts.mockResolvedValue([product("p1", [{ price: 500, originalPrice: null }])]);
    expect(find(await render(), OfferBanner)?.props.offer).toEqual({ pct: 0, count: 0 });
  });
});

describe("catalogue page sort", () => {
  it("opens on best sellers, and keeps that default out of the URL", async () => {
    // The first screenful is what most visitors judge the shop on, so the
    // catalogue opens on rating. Serialising the default would put ?sort=rating
    // on every link for no gain.
    getProducts.mockResolvedValue(Array.from({ length: 30 }, (_, i) => product(`p${i}`)));
    const b = browser(await render());

    expect(getProducts).toHaveBeenCalledWith({ sortBy: "rating" });
    expect(b?.sortBy).toBe("rating");
    expect(b?.defaultSort).toBe("rating");
    expect((b?.buildPageLink as (p: number) => string)(2)).toBe("/categories?page=2");
  });

  it("serialises any other order, so paging does not silently reset it", async () => {
    getProducts.mockResolvedValue(Array.from({ length: 30 }, (_, i) => product(`p${i}`)));
    const b = browser(await render({ sort: "name" }));
    expect((b?.buildPageLink as (p: number) => string)(2)).toBe("/categories?sort=name&page=2");
  });
});

describe("catalogue page department lists", () => {
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

    // The browser is only ever handed the departments that survive
    // showsNavDropdown, so the three empty ones are unreachable from here.
    const given = browser(await render())?.departments as { slug: string }[];
    expect(given.map((d) => d.slug)).toEqual(["women"]);
  });

  it("hands the rail every department once designs exist under each", async () => {
    getDepartments.mockResolvedValue([
      dept({ slug: "women", designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }] }),
      dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#C4D3EF", image: null }] }),
    ]);
    const given = browser(await render())?.departments as { slug: string }[];
    expect(given.map((d) => d.slug)).toEqual(["women", "men"]);
  });
});

describe("catalogue page filters", () => {
  it("sends the price and stock filters to the query, and never narrows the counts read", async () => {
    await render({ minPrice: "1000", maxPrice: "4500", inStockOnly: "true" });

    // First read is the whole catalogue — the sidebar counts must not move
    // when a filter is applied.
    expect(getProducts).toHaveBeenNthCalledWith(1, { sortBy: "rating" });
    expect(getProducts).toHaveBeenNthCalledWith(2, {
      sortBy: "rating",
      designSlug: undefined,
      minPrice: 1000,
      maxPrice: 4500,
      inStockOnly: true,
    });
  });

  it("counts what is applied for the collapsed Filters button, ignoring sort", async () => {
    // Sort reorders, it never hides — counting it would tell a phone that a
    // filter is on when nothing is being held back.
    const b = browser(await render({
      category: "cat", minPrice: "1000", inStockOnly: "true", sort: "name",
    }));
    expect(b?.activeCount).toBe(3);
  });

  it("counts nothing when the page is unfiltered", async () => {
    expect(browser(await render({ sort: "name" }))?.activeCount).toBe(0);
  });

  it("ignores a price that is not a number rather than passing NaN to the query", async () => {
    await render({ minPrice: "abc" });
    // Nothing is being filtered, so the catalogue read is the only read.
    expect(getProducts).toHaveBeenCalledTimes(1);
    expect(getProducts).toHaveBeenCalledWith({ sortBy: "rating" });
  });
});

describe("catalogue page links", () => {
  it("keeps every catalogue link on '/', so nothing points back at /categories", async () => {
    // /categories 308s here (next.config.ts). A link from this page to it would
    // cost a redirect hop on every filter and page click.
    getProducts.mockResolvedValue(Array.from({ length: 30 }, (_, i) => product(`p${i}`)));
    const b = browser(await render({ category: "cat", minPrice: "1000" }));

    expect(b?.action).toBe("/categories");
    expect(b?.allHref).toBe("/categories?minPrice=1000");
    expect((b?.buildPageLink as (p: number) => string)(2))
      .toBe("/categories?category=cat&minPrice=1000&page=2");
    expect(b?.fromPath).toBe("/categories");
  });

  it("offers a bare '/' as the way out when filters match nothing", async () => {
    getProducts.mockResolvedValueOnce([product("p1")]).mockResolvedValueOnce([]);
    expect(browser(await render({ category: "cat" }))?.clearHref).toBe("/categories");
  });

  it("has no clear link to offer when nothing is filtered", async () => {
    expect(browser(await render())?.clearHref).toBeNull();
  });
});

import { describe, it, expect, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";
import type { DesignMedia } from "@/app/_lib/taxonomy-media";
import type { ProductView } from "@/app/_lib/products";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
// The page module also holds the design and product views, whose imports
// reach next-auth through the header. None of that is under test here.
vi.mock("@/app/_components/home/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/app/_components/home/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/app/_components/home/product-card", () => ({ ProductCard: () => null }));
vi.mock("@/app/_components/shared/sort-select", () => ({ SortSelect: () => null }));
vi.mock("@/app/_components/analytics/track-category-view", () => ({
  TrackCategoryView: () => null,
}));

import { DepartmentBody } from "../page";
import { DesignTile } from "@/app/_components/home/design-tile";
import { CatalogueBrowser } from "@/app/_components/catalogue/catalogue-browser";

const department: DepartmentView = {
  slug: "men", name: "Men", navLabel: "Men", tileName: "Men",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#AEC3D1", sortOrder: 0,
  designs: [
    { slug: "car", name: "Car", hex: "#AEC3D1", image: null },
    { slug: "simpsons", name: "Simpsons", hex: "#EFD9A8", image: "/design/simpsons.jpg" },
  ],
};

const women: DepartmentView = {
  ...department, slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }],
};

// `category` is the product's design slug — see ProductView in products.ts,
// which is what countsByDesign reads. Cast because only the handful of fields
// the counting and paging touch are populated; the card that would need the
// rest is mocked out.
const product = (id: string, category: string) =>
  ({ id, name: id, category, variants: [] }) as unknown as ProductView;

/** Every DesignTile in the tree, with the props it was handed. */
function tiles(node: unknown, out: Record<string, unknown>[] = []) {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) tiles(child, out);
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === DesignTile && el.props) out.push(el.props);
  if (el.props) tiles(el.props.children, out);
  return out;
}

function collectText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) collectText(props.children, out);
  return out;
}

/** The props handed to the shared browse layout. The browse markup itself is
 *  CatalogueBrowser's to test; what matters here is what this page asks of it. */
function browser(node: unknown): Record<string, unknown> | undefined {
  if (node === null || node === undefined || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = browser(child);
      if (found) return found;
    }
    return undefined;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === CatalogueBrowser) return el.props;
  return el.props ? browser(el.props.children) : undefined;
}

const render = (over: Partial<Parameters<typeof DepartmentBody>[0]> = {}) =>
  DepartmentBody({
    department,
    departments: [department, women],
    media: new Map(),
    allProducts: [
      product("m1", "car"), product("m2", "simpsons"), product("w1", "cat"),
    ],
    products: [product("m1", "car"), product("m2", "simpsons")],
    sortBy: "newest",
    currentPage: 1,
    inStockOnly: false,
    ...over,
  });

describe("DepartmentBody designs", () => {
  it("renders each design as a card carrying its photos and product count", () => {
    const media = new Map<string, DesignMedia>([
      ["car", { photos: ["/a.jpg", "/b.jpg"], count: 1 }],
      ["simpsons", { photos: ["/c.jpg"], count: 4 }],
    ]);
    // The tiles sit above the grid, so they arrive as the browser's aboveGrid.
    const found = tiles(browser(render({ media }))?.aboveGrid);

    expect(found.map((t) => t.href)).toEqual([
      "/categories/men/car",
      "/categories/men/simpsons",
    ]);
    // The count is singularised, the way the home page's tiles do it.
    expect(found.map((t) => t.note)).toEqual(["1 product", "4 products"]);
    expect(found[0].slides).toEqual([
      { hex: "#AEC3D1", photo: "/a.jpg" },
      { hex: "#AEC3D1", photo: "/b.jpg" },
    ]);
  });

  it("falls back to the design's own image, then to a captioned tint", () => {
    // A design with no product photography still has to read as something.
    const found = tiles(browser(render())?.aboveGrid);

    expect(found[0].slides).toEqual([{ hex: "#AEC3D1", photo: null, title: "Car" }]);
    expect(found[1].slides).toEqual([{ hex: "#EFD9A8", photo: "/design/simpsons.jpg" }]);
    // Zero products prints nothing rather than "0 products" — a live tile
    // showing a zero reads as broken.
    expect(found.map((t) => t.note)).toEqual(["", ""]);
  });

  it("heads the tiles with the sub-category and how many designs are in it", () => {
    const text = collectText(browser(render())?.aboveGrid);
    expect(text).toContain("Oversized Graphic T-Shirts");
    expect(text).toContain("2 designs");
  });

  it("offers no tile row at all when a department holds no designs yet", () => {
    // CatalogueBrowser prints the empty screen; this page just has nothing to
    // put above the grid.
    const tree = render({ department: { ...department, designs: [] }, products: [] });
    expect(browser(tree)?.aboveGrid).toBeNull();
    expect(tiles(tree)).toHaveLength(0);
  });
});

describe("DepartmentBody browse rail", () => {
  it("filters within the department, not back out to the whole catalogue", () => {
    // A hardcoded "/" here would bounce every applied filter to the home page.
    const b = browser(render());
    expect(b?.action).toBe("/categories/men");
    expect(b?.fromPath).toBe("/categories/men");
    expect(b?.selectedDepartment).toBe("men");
    // "All products" still escapes to the full catalogue on purpose.
    expect(b?.allHref).toBe("/");
  });

  it("lists every department in the rail, so you can cross without going home", () => {
    const given = browser(render())?.departments as { slug: string }[];
    expect(given.map((d) => d.slug)).toEqual(["men", "women"]);
  });

  it("counts the whole catalogue in the rail, never just this department", () => {
    const b = browser(render());
    expect(b?.totalCount).toBe(3);
    expect((b?.byDepartment as Map<string, number>).get("women")).toBe(1);
    expect((b?.byDepartment as Map<string, number>).get("men")).toBe(2);
  });

  it("counts price and stock as filters, but never the department itself", () => {
    // The department is the page, not a filter on it — badging it would tell a
    // phone something is being held back when nothing is.
    expect(browser(render())?.activeCount).toBe(0);
    expect(browser(render({ minPrice: 1000, inStockOnly: true }))?.activeCount).toBe(2);
  });

  it("clears back to the bare department, keeping you where you are", () => {
    expect(browser(render())?.clearHref).toBeNull();
    expect(browser(render({ minPrice: 1000 }))?.clearHref).toBe("/categories/men");
  });
});

describe("DepartmentBody counts and paging", () => {
  it("says how many products are here", () => {
    expect(browser(render())?.countLabel).toBe("2 products");
    expect(browser(render({ products: [product("m1", "car")] }))?.countLabel)
      .toBe("1 product");
  });

  it("says how many of how many once a filter narrows the list", () => {
    const b = browser(render({ products: [product("m1", "car")], inStockOnly: true }));
    expect(b?.countLabel).toBe("1 of 2 products");
  });

  it("carries sort, price and stock through every page link", () => {
    const b = browser(render({ sortBy: "rating", minPrice: 1000, inStockOnly: true }));
    const link = b?.buildPageLink as (page: number) => string;
    expect(link(1)).toBe("/categories/men?sort=rating&minPrice=1000&inStockOnly=true");
    expect(link(3)).toBe("/categories/men?sort=rating&minPrice=1000&inStockOnly=true&page=3");
  });

  it("leaves a bare department path when nothing is applied", () => {
    expect((browser(render())?.buildPageLink as (p: number) => string)(1))
      .toBe("/categories/men");
  });

  it("pages at twelve, and hands the browser only the current page", () => {
    const many = Array.from({ length: 25 }, (_, i) => product(`m${i}`, "car"));
    const b = browser(render({ products: many, currentPage: 2 }));
    expect(b?.totalPages).toBe(3);
    expect((b?.products as unknown[]).length).toBe(12);
    expect((b?.products as { id: string }[])[0].id).toBe("m12");
  });
});

import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("@/app/_components/home/product-card", () => ({ ProductCard: () => null }));
vi.mock("@/app/_components/shared/sort-select", () => ({ SortSelect: () => null }));

import { CatalogueBrowser } from "@/app/_components/catalogue/catalogue-browser";
import { ProductCard } from "@/app/_components/home/product-card";
import { FilterRail } from "@/app/_components/categories/filter-rail";
import { FilterDisclosure } from "@/app/_components/categories/filter-disclosure";
import type { ProductView } from "@/app/_lib/products";

function collect(
  node: unknown,
  out: { type: unknown; props: Record<string, unknown> }[] = [],
) {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.props) {
    out.push({ type: el.type, props: el.props });
    collect(el.props.children, out);
  }
  return out;
}

function text(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) text(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) text(props.children, out);
  return out;
}

const flat = (node: unknown) => text(node).join(" ").replace(/\s+/g, " ").trim();
const hrefs = (node: unknown) =>
  collect(node).map((e) => e.props.href).filter((h): h is string => typeof h === "string");

const products = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}` })) as unknown as ProductView[];

const render = (over: Partial<Parameters<typeof CatalogueBrowser>[0]> = {}) =>
  CatalogueBrowser({
    departments: [],
    byDesign: new Map(),
    byDepartment: new Map(),
    totalCount: 22,
    inStockOnly: false,
    sortBy: "rating",
    defaultSort: "rating",
    action: "/",
    allHref: "/",
    clearHref: null,
    products: products(3),
    countLabel: "22 products",
    activeCount: 0,
    currentPage: 1,
    totalPages: 1,
    buildPageLink: (page) => (page > 1 ? `/?page=${page}` : "/"),
    fromPath: "/",
    ...over,
  });

describe("CatalogueBrowser", () => {
  it("renders the count, the rail and a card per product", () => {
    const tree = render();
    expect(flat(tree)).toContain("22 products");
    expect(collect(tree).filter((e) => e.type === ProductCard)).toHaveLength(3);
    expect(collect(tree).find((e) => e.type === FilterRail)).toBeDefined();
  });

  it("renders no heading, because both callers own their own h1", () => {
    // "/" heads the page from OfferBanner and a department page heads it above
    // this; an h1 here would be a second one on both.
    const tree = render();
    expect(collect(tree).some((e) => e.type === "h1")).toBe(false);
  });

  it("puts aboveGrid between the count and the products", () => {
    const tree = render({ aboveGrid: "DESIGN TILES" });
    const joined = flat(tree);
    expect(joined.indexOf("22 products")).toBeLessThan(joined.indexOf("DESIGN TILES"));
    expect(joined).toContain("DESIGN TILES");
  });

  it("hands the rail the filter state it was given", () => {
    const rail = collect(render({
      action: "/categories/men",
      selectedDepartment: "men",
      minPrice: 1000,
      inStockOnly: true,
      clearHref: "/categories/men",
    })).find((e) => e.type === FilterRail)?.props;

    expect(rail?.action).toBe("/categories/men");
    expect(rail?.selectedDepartment).toBe("men");
    expect(rail?.minPrice).toBe(1000);
    expect(rail?.inStockOnly).toBe(true);
    expect(rail?.clearHref).toBe("/categories/men");
  });

  it("badges the collapsed Filters button with what is applied", () => {
    const disclosure = collect(render({ activeCount: 2 }))
      .find((e) => e.type === FilterDisclosure)?.props;
    expect(disclosure?.activeCount).toBe(2);
  });

  describe("empty screens", () => {
    it("blames the filters, and offers the way out, when filters are on", () => {
      const tree = render({ products: [], activeCount: 2, clearHref: "/categories/men" });
      expect(flat(tree)).toContain("Nothing matches these filters");
      expect(hrefs(tree)).toContain("/categories/men");
    });

    it("blames nobody, and offers no clear link, when nothing is filtered", () => {
      // A department with nothing in it is not the shopper's doing, and
      // "clear filters" there would be nonsense.
      const tree = render({ products: [], activeCount: 0, clearHref: null });
      const joined = flat(tree);
      expect(joined).toContain("Nothing here yet");
      expect(joined).not.toContain("Nothing matches these filters");
      expect(joined).not.toContain("Clear all filters");
    });
  });

  describe("pagination", () => {
    it("draws no pager for a single page", () => {
      expect(collect(render({ totalPages: 1 })).some((e) => e.props["aria-label"] === "Pagination"))
        .toBe(false);
    });

    it("builds every page link through buildPageLink and marks where you are", () => {
      const tree = render({
        totalPages: 3,
        currentPage: 2,
        buildPageLink: (page) => (page > 1 ? `/categories/men?page=${page}` : "/categories/men"),
      });
      expect(hrefs(tree)).toEqual(expect.arrayContaining([
        "/categories/men", "/categories/men?page=2", "/categories/men?page=3",
      ]));

      const current = collect(tree).filter((e) => e.props["aria-current"] === "page");
      expect(current).toHaveLength(1);
      expect(current[0].props.href).toBe("/categories/men?page=2");
    });
  });
});

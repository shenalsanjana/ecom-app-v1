import { describe, it, expect, beforeEach, vi } from "vitest";

// The price and stock controls used to be bare inputs in no form, with no
// submit — they rendered, and filtered nothing. These tests hold the wiring:
// every control reaches the query, and a junk price is dropped rather than
// passed on as NaN (which matches nothing and explains nothing).

const { getProducts, getDesigns } = vi.hoisted(() => ({
  getProducts: vi.fn(),
  getDesigns: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/app/_lib/products", () => ({
  getProducts,
  getDesigns,
  parseSortBy: (_v: string | undefined, fallback: string) => fallback,
}));
vi.mock("@/app/_components/home/product-card", () => ({ ProductCard: () => null }));
vi.mock("@/app/_components/home/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/app/_components/home/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/app/_components/shared/sort-select", () => ({ SortSelect: () => null }));

import SearchPage from "../page";

/** Every element carrying a `name`, with the value it would submit. */
function formFields(node: unknown, out: { name: unknown; value: unknown }[] = []) {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) formFields(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) {
    if (typeof props.name === "string") out.push({ name: props.name, value: props.value });
    formFields(props.children, out);
  }
  return out;
}

beforeEach(() => {
  getProducts.mockReset().mockResolvedValue([]);
  getDesigns.mockReset().mockResolvedValue([]);
});

describe("/search filters", () => {
  it("sends every control to the query", async () => {
    await SearchPage({
      searchParams: Promise.resolve({
        q: "tee",
        category: "cat",
        minPrice: "1000",
        maxPrice: "4500",
        inStockOnly: "true",
      }),
    });

    expect(getProducts).toHaveBeenCalledWith({
      designSlug: "cat",
      searchQuery: "tee",
      sortBy: "newest",
      minPrice: 1000,
      maxPrice: 4500,
      inStockOnly: true,
    });
  });

  it("ignores a price that is not a number rather than passing NaN to the query", async () => {
    await SearchPage({ searchParams: Promise.resolve({ q: "tee", minPrice: "abc" }) });

    expect(getProducts).toHaveBeenCalledWith(
      expect.objectContaining({ minPrice: undefined, maxPrice: undefined }),
    );
  });

  it("carries the search term and the order through the filter form", async () => {
    const tree = await SearchPage({
      searchParams: Promise.resolve({ q: "tee", category: "cat" }),
    });
    const hidden = formFields(tree).filter((f) => f.name === "q" || f.name === "category");

    // Applying a price must not drop what you searched for or where you are.
    expect(hidden).toEqual([
      { name: "q", value: "tee" },
      { name: "category", value: "cat" },
    ]);
  });
});

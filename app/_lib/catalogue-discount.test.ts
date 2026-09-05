import { describe, it, expect } from "vitest";
import { catalogueDiscount } from "@/app/_lib/catalogue-discount";

const p = (...variants: [number, number | null][]) => ({
  variants: variants.map(([price, originalPrice]) => ({ price, originalPrice })),
});

describe("catalogueDiscount", () => {
  it("reports the largest cut in the catalogue and how many products carry one", () => {
    expect(catalogueDiscount([
      p([800, 1000]),   // 20%
      p([1200, 2000]),  // 40%
      p([500, null]),   // not reduced
    ])).toEqual({ pct: 40, count: 2 });
  });

  it("says nothing is on sale when nothing is", () => {
    // The banner leans on this: pct 0 means it must not announce a sale.
    expect(catalogueDiscount([p([500, null]), p([900, null])])).toEqual({ pct: 0, count: 0 });
    expect(catalogueDiscount([])).toEqual({ pct: 0, count: 0 });
  });

  it("counts a product once however many of its variants are reduced", () => {
    expect(catalogueDiscount([p([800, 1000], [700, 1000], [900, 1000])]))
      .toEqual({ pct: 30, count: 1 });
  });

  it("takes a product's best variant cut, not its first", () => {
    expect(catalogueDiscount([p([950, 1000], [500, 1000])]).pct).toBe(50);
  });

  it("ignores an originalPrice that is not actually a markdown", () => {
    // discountPct already floors these at 0; the count must not be inflated by
    // a row where originalPrice is set but equal to or below the price.
    expect(catalogueDiscount([p([1000, 1000]), p([1200, 1000])]))
      .toEqual({ pct: 0, count: 0 });
  });
});

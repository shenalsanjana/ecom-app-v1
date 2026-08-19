import { describe, it, expect } from "vitest";
import { buildPlainStockMap, buildDesignStockMap } from "./variants";
import {
  LOW_STOCK_THRESHOLD,
  unitsForVariant,
  lowStockSignal,
  pickBestsellers,
} from "./product-signals";

const SIZES = [{ size: "S" }, { size: "M" }, { size: "L" }];

function maps(plainQty: number, designQty: number) {
  return {
    plainStock: buildPlainStockMap(
      SIZES.map((s, i) => ({
        id: `ps-${i}`,
        colorSlug: "white",
        size: s.size,
        quantity: plainQty,
      })),
    ),
    designStock: buildDesignStockMap([{ id: "d1", quantity: designQty }]),
  };
}

describe("unitsForVariant", () => {
  it("sums the fulfillable units across sizes", () => {
    const { plainStock, designStock } = maps(2, 100);
    expect(unitsForVariant(SIZES, "white", "d1", plainStock, designStock)).toBe(6);
  });

  it("is capped by the shared design pool across the whole colour, not per size", () => {
    // 3 sizes x 10 plain blanks each = 30 blanks, but the design pool has
    // only 1 print left. Every finished tee consumes one blank AND one print
    // from that single shared pool, so the true total is min(30, 1) = 1 —
    // not 1 per size (which would triple-count the one available print).
    const { plainStock, designStock } = maps(10, 1);
    expect(unitsForVariant(SIZES, "white", "d1", plainStock, designStock)).toBe(1);
  });

  it("pins the pool cap explicitly: plenty of blanks, design qty 2 -> 2", () => {
    const { plainStock, designStock } = maps(10, 2);
    expect(unitsForVariant(SIZES, "white", "d1", plainStock, designStock)).toBe(2);
  });

  it("is zero when the design is exhausted", () => {
    const { plainStock, designStock } = maps(10, 0);
    expect(unitsForVariant(SIZES, "white", "d1", plainStock, designStock)).toBe(0);
  });

  it("is zero when the product has no design at all", () => {
    const { plainStock, designStock } = maps(10, 10);
    expect(unitsForVariant(SIZES, "white", null, plainStock, designStock)).toBe(0);
  });

  it("ignores sizes with no matching blank", () => {
    const { plainStock, designStock } = maps(4, 100);
    expect(
      unitsForVariant([...SIZES, { size: "XXL" }], "white", "d1", plainStock, designStock),
    ).toBe(12);
  });
});

describe("lowStockSignal", () => {
  it("reports at the threshold", () => {
    expect(lowStockSignal(LOW_STOCK_THRESHOLD)).toBe(LOW_STOCK_THRESHOLD);
  });

  it("reports below the threshold", () => {
    expect(lowStockSignal(1)).toBe(1);
  });

  it("stays silent above the threshold", () => {
    expect(lowStockSignal(LOW_STOCK_THRESHOLD + 1)).toBeUndefined();
  });

  it("stays silent at zero — out of stock is not a scarcity nudge", () => {
    expect(lowStockSignal(0)).toBeUndefined();
  });
});

describe("pickBestsellers", () => {
  it("takes the top N by units sold", () => {
    const picked = pickBestsellers(
      [
        { productId: "a", units: 3 },
        { productId: "b", units: 10 },
        { productId: "c", units: 7 },
      ],
      2,
    );
    expect(picked).toEqual(new Set(["b", "c"]));
  });

  it("breaks ties by productId so badges do not shuffle between cache windows", () => {
    const input = [
      { productId: "zeta", units: 5 },
      { productId: "alpha", units: 5 },
      { productId: "mid", units: 5 },
    ];
    expect(pickBestsellers(input, 2)).toEqual(new Set(["alpha", "mid"]));
    expect(pickBestsellers([...input].reverse(), 2)).toEqual(new Set(["alpha", "mid"]));
  });

  it("ignores products with no sales", () => {
    const picked = pickBestsellers(
      [
        { productId: "a", units: 0 },
        { productId: "b", units: 2 },
      ],
      5,
    );
    expect(picked).toEqual(new Set(["b"]));
  });

  it("returns an empty set for an empty catalog", () => {
    expect(pickBestsellers([], 3)).toEqual(new Set());
  });

  it("returns fewer than N when fewer products have sold", () => {
    expect(pickBestsellers([{ productId: "a", units: 1 }], 3).size).toBe(1);
  });
});

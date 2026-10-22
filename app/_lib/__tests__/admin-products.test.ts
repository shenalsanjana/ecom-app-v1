import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug, parseSizes, serializeSizes, buildProductWhere } from "../admin-products";

describe("slugify", () => {
  it("lowercases, hyphenates, and trims", () => {
    expect(slugify("Oversize Cat Tee — White")).toBe("oversize-cat-tee-white");
    expect(slugify("  Hello,  World!  ")).toBe("hello-world");
  });
  it("returns an empty string for all-punctuation/empty input (caller must guard)", () => {
    expect(slugify("")).toBe("");
    expect(slugify("---")).toBe("");
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

describe("buildProductWhere", () => {
  it("active tab → archived:false", () => {
    expect(buildProductWhere({ tab: "active" })).toEqual({ archived: false, status: "PUBLISHED" });
  });
  it("low-stock tab behaves like active (archived:false) — id filtering is layered on by resolveProductWhere, not this function", () => {
    expect(buildProductWhere({ tab: "low-stock" })).toEqual({ archived: false, status: "PUBLISHED" });
  });
  it("archived tab → archived:true", () => {
    expect(buildProductWhere({ tab: "archived" })).toEqual({ archived: true });
  });
  it("all tab → no archived constraint", () => {
    expect(buildProductWhere({ tab: "all" })).toEqual({});
  });
  it("keeps draft and published tabs separate from archived", () => {
    expect(buildProductWhere({ tab: "draft" })).toEqual({ archived: false, status: "DRAFT" });
    expect(buildProductWhere({ tab: "published" })).toEqual({ archived: false, status: "PUBLISHED" });
  });
  it("adds category and case-insensitive search on name + id + active size SKU", () => {
    const w = buildProductWhere({ tab: "active", category: "cat", q: "white" });
    expect(w.archived).toBe(false);
    expect(w.AND).toEqual([{ OR: [
      { designSlug: { in: ["cat"] } },
      { additionalCollections: { some: { designSlug: { in: ["cat"] } } } },
    ] }]);
    expect(w.OR).toEqual([
      { name: { contains: "white", mode: "insensitive" } },
      { id: { contains: "white", mode: "insensitive" } },
      { variants: { some: { archived: false, sizeStocks: { some: { archived: false, sku: { contains: "white", mode: "insensitive" } } } } } },
    ]);
  });
});

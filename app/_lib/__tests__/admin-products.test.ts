import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug, parseSizes, serializeSizes } from "../admin-products";

describe("slugify", () => {
  it("lowercases, hyphenates, and trims", () => {
    expect(slugify("Oversize Cat Tee — White")).toBe("oversize-cat-tee-white");
    expect(slugify("  Hello,  World!  ")).toBe("hello-world");
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

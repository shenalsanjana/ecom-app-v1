import { describe, it, expect } from "vitest";
import { parsePrice } from "@/app/_lib/parse-price";

describe("parsePrice", () => {
  it("reads a price the shopper typed", () => {
    expect(parsePrice("1500")).toBe(1500);
    expect(parsePrice("1499.50")).toBe(1499.5);
  });

  it("treats an absent or blank box as no filter at all", () => {
    expect(parsePrice(undefined)).toBeUndefined();
    expect(parsePrice("")).toBeUndefined();
    expect(parsePrice("   ")).toBeUndefined();
  });

  it("drops anything that is not a real, non-negative number", () => {
    // A NaN or -Infinity reaching Prisma matches nothing and says nothing.
    expect(parsePrice("abc")).toBeUndefined();
    expect(parsePrice("-100")).toBeUndefined();
    expect(parsePrice("Infinity")).toBeUndefined();
  });

  it("keeps the leading number of a half-typed value rather than discarding it", () => {
    // parseFloat's own behaviour, stated so a future change is deliberate.
    expect(parsePrice("1500abc")).toBe(1500);
  });
});

import { describe, it, expect } from "vitest";
import { prettifyCategory } from "../category-label";

describe("prettifyCategory", () => {
  it("title-cases a hyphenated slug", () => {
    expect(prettifyCategory("t-shirts")).toBe("T-Shirts");
    expect(prettifyCategory("day-dresses")).toBe("Day Dresses");
  });

  it("handles a single word", () => {
    expect(prettifyCategory("denim")).toBe("Denim");
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(prettifyCategory("")).toBe("");
    expect(prettifyCategory("   ")).toBe("");
  });
});

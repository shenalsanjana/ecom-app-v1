import { describe, it, expect } from "vitest";
import { discountPct } from "../pricing";

describe("discountPct", () => {
  it("rounds the percentage off to the nearest integer", () => {
    expect(discountPct(3900, 5200)).toBe(25);
    expect(discountPct(70, 99)).toBe(29);
  });

  it("returns 0 when there is no discount", () => {
    expect(discountPct(5200, 5200)).toBe(0);
    expect(discountPct(6000, 5200)).toBe(0);
  });

  it("returns 0 for invalid originals", () => {
    expect(discountPct(100, 0)).toBe(0);
    expect(discountPct(100, -10)).toBe(0);
  });
});

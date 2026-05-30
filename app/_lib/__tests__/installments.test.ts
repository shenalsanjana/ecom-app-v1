import { describe, it, expect } from "vitest";
import { installmentAmount, INSTALMENT_COUNT } from "../installments";

describe("installmentAmount", () => {
  it("splits a total into 3 equal parts by default", () => {
    expect(INSTALMENT_COUNT).toBe(3);
    expect(installmentAmount(11100)).toBe(3700);
  });

  it("rounds to 2 decimal places", () => {
    expect(installmentAmount(1000)).toBe(333.33);
  });

  it("returns 0 for non-positive or invalid totals", () => {
    expect(installmentAmount(0)).toBe(0);
    expect(installmentAmount(-5)).toBe(0);
    expect(installmentAmount(Number.NaN)).toBe(0);
  });
});

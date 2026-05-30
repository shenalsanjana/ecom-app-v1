import { describe, it, expect } from "vitest";
import { stockStatus } from "../stock-indicator";

describe("stockStatus", () => {
  it("reports out of stock at 0 or below", () => {
    expect(stockStatus(0)).toEqual({ tone: "out", label: "Out of stock" });
    expect(stockStatus(-2)).toEqual({ tone: "out", label: "Out of stock" });
  });

  it("reports low stock at or below the threshold", () => {
    expect(stockStatus(3)).toEqual({ tone: "low", label: "Only 3 left" });
    expect(stockStatus(5)).toEqual({ tone: "low", label: "Only 5 left" });
  });

  it("reports in stock above the threshold", () => {
    expect(stockStatus(6)).toEqual({ tone: "in", label: "In stock" });
  });
});

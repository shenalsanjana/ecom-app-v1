import { describe, it, expect } from "vitest";
import { shouldStartProgress } from "./navigation-progress-util";

describe("shouldStartProgress", () => {
  it("returns true for an internal link to a different path", () => {
    expect(shouldStartProgress("/products/p1", "/categories", "")).toBe(true);
  });

  it("returns false when the destination equals the current path", () => {
    expect(shouldStartProgress("/cart", "/cart", "")).toBe(false);
  });

  it("returns false for an external http(s) link", () => {
    expect(shouldStartProgress("/account", "https://x.com/a", "")).toBe(false);
  });

  it("returns false for mailto/tel/anchor links", () => {
    expect(shouldStartProgress("/x", "mailto:a@b.com", "")).toBe(false);
    expect(shouldStartProgress("/x", "tel:123", "")).toBe(false);
    expect(shouldStartProgress("/x", "#section", "")).toBe(false);
  });

  it("returns false when there is no href", () => {
    expect(shouldStartProgress("/x", null, "")).toBe(false);
  });

  it("treats a same-path change of query string as navigation", () => {
    expect(shouldStartProgress("/search", "/search?q=tee", "")).toBe(true);
  });
});

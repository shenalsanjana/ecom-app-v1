import { describe, it, expect } from "vitest";
import {
  CATEGORY_TINTS,
  TINT_PALETTE,
  tintForSlug,
  relativeLuminance,
  inkFor,
  INK_DARK,
  INK_LIGHT,
} from "./category-tint";

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("tintForSlug", () => {
  it("returns the named tint for each slug the handoff specifies", () => {
    expect(tintForSlug("cat")).toBe("#EFC4C4");
    expect(tintForSlug("dino")).toBe("#AEBBA0");
    expect(tintForSlug("bear")).toBe("#C4906E");
    expect(tintForSlug("retro")).toBe("#E4D3B0");
    expect(tintForSlug("wave")).toBe("#AEC3D1");
    expect(tintForSlug("nature")).toBe("#BFC7A6");
  });

  it("falls back to a palette color for an unknown slug", () => {
    expect(TINT_PALETTE).toContain(tintForSlug("space-invaders"));
  });

  it("is deterministic for the same unknown slug", () => {
    expect(tintForSlug("space-invaders")).toBe(tintForSlug("space-invaders"));
  });

  it("spreads different unknown slugs across the palette", () => {
    const picked = new Set(
      ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"].map(
        tintForSlug,
      ),
    );
    expect(picked.size).toBeGreaterThan(1);
  });

  it("never returns an empty string", () => {
    expect(tintForSlug("")).not.toBe("");
    expect(TINT_PALETTE).toContain(tintForSlug(""));
  });
});

describe("relativeLuminance", () => {
  it("returns 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("is case-insensitive", () => {
    expect(relativeLuminance("#efc4c4")).toBeCloseTo(relativeLuminance("#EFC4C4"), 10);
  });
});

describe("inkFor", () => {
  it("picks the dark ink on every named tint, including the dark ones", () => {
    // A naive luminance threshold at 0.5 would send dino (0.471) and bear
    // (0.328) to the light ink at 1.7:1 and 2.4:1. Max-contrast must not.
    for (const tint of Object.values(CATEGORY_TINTS)) {
      expect(inkFor(tint)).toBe(INK_DARK);
    }
  });

  it("picks the light ink on a genuinely dark background", () => {
    expect(inkFor("#1a1a1a")).toBe(INK_LIGHT);
  });

  it("clears WCAG AA 4.5:1 for small text on every named tint", () => {
    for (const [slug, tint] of Object.entries(CATEGORY_TINTS)) {
      const ratio = contrast(inkFor(tint), tint);
      expect(ratio, `${slug} (${tint})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("clears AA on every palette entry reachable through the fallback", () => {
    for (const tint of TINT_PALETTE) {
      expect(contrast(inkFor(tint), tint)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

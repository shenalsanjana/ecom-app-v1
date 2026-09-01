import { describe, it, expect } from "vitest";
import {
  DEPARTMENT_TINTS,
  DESIGN_TINTS,
  ALL_TINTS,
  TINT_PALETTE,
  tintForSlug,
  relativeLuminance,
  contrastRatio,
  inkFor,
  INK_DARK,
  INK_LIGHT,
  SCRIM_ALPHA,
  compositeOverBlack,
} from "./taxonomy-tint";

describe("tintForSlug", () => {
  it("returns the named tint for each slug the handoff specifies", () => {
    expect(tintForSlug("cat")).toBe("#EFC4C4");
    expect(tintForSlug("dino")).toBe("#AEBBA0");
    expect(tintForSlug("bear")).toBe("#C4906E");
    expect(TINT_PALETTE).toContain(tintForSlug("retro"));
    expect(TINT_PALETTE).toContain(tintForSlug("wave"));
    expect(TINT_PALETTE).toContain(tintForSlug("nature"));
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
    expect(picked.size).toBeGreaterThanOrEqual(3);
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
    for (const tint of Object.values(DESIGN_TINTS)) {
      expect(inkFor(tint)).toBe(INK_DARK);
    }
  });

  it("picks the light ink on a genuinely dark background", () => {
    expect(inkFor("#1a1a1a")).toBe(INK_LIGHT);
  });

  it("clears WCAG AA 4.5:1 for small text on every named tint", () => {
    for (const [slug, tint] of Object.entries(DESIGN_TINTS)) {
      const ratio = contrastRatio(inkFor(tint), tint);
      expect(ratio, `${slug} (${tint})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("clears AA on every palette entry reachable through the fallback", () => {
    for (const tint of TINT_PALETTE) {
      expect(contrastRatio(inkFor(tint), tint)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("taxonomy tints", () => {
  it("defines all four departments", () => {
    expect(Object.keys(DEPARTMENT_TINTS).sort()).toEqual(
      ["accessories", "men", "plain", "women"],
    );
  });

  it("defines all 23 designs", () => {
    expect(Object.keys(DESIGN_TINTS)).toHaveLength(23);
  });

  it("keeps the two shipped design tints unchanged", () => {
    expect(DESIGN_TINTS.cat).toBe("#EFC4C4");
    expect(DESIGN_TINTS.dino).toBe("#AEBBA0");
  });

  it("seeds Cap lightened to clear AA, not the canvas value", () => {
    expect(DESIGN_TINTS.cap).toBe("#A59585");
    expect(DESIGN_TINTS.cap).not.toBe("#8E7A66");
  });

  it("clears WCAG AA for every tint using the ink the runtime picks", () => {
    const failures = Object.entries(ALL_TINTS)
      .map(([slug, hex]) => [slug, hex, contrastRatio(inkFor(hex), hex)] as const)
      .filter(([, , ratio]) => ratio < 4.5);
    expect(failures).toEqual([]);
  });
});

describe("compositeOverBlack", () => {
  it("returns the color unchanged at alpha 0", () => {
    expect(compositeOverBlack("#EFC4C4", 0)).toBe("#efc4c4");
  });

  it("returns black at alpha 1", () => {
    expect(compositeOverBlack("#EFC4C4", 1)).toBe("#000000");
  });

  it("matches a hand-computed composite", () => {
    // #EFC4C4 = (239, 196, 196); at alpha 0.3 each channel scales by 0.7:
    // 239*0.7 = 167.3 -> 167 (0xa7), 196*0.7 = 137.2 -> 137 (0x89).
    expect(compositeOverBlack("#EFC4C4", 0.3)).toBe("#a78989");
  });
});

describe("SCRIM_ALPHA", () => {
  it("clears AA against INK_LIGHT through the scrim alone, for every named tint", () => {
    // If a photo tile's image never paints — slow load, broken URL, rejected
    // host — the label still sits on the tint composited with the scrim
    // alone, since TintTile always uses INK_LIGHT once an image is given.
    // That composite must itself clear 4.5:1, independent of the photo.
    const failures = Object.entries(ALL_TINTS)
      .map(([slug, hex]) => {
        const composite = compositeOverBlack(hex, SCRIM_ALPHA);
        return [slug, composite, contrastRatio(composite, INK_LIGHT)] as const;
      })
      .filter(([, , ratio]) => ratio < 4.5);
    expect(failures).toEqual([]);
  });

  it("is the smallest one-decimal alpha that clears AA for every tint", () => {
    // One tenth below SCRIM_ALPHA, at least one tint must fail — otherwise
    // SCRIM_ALPHA is not the minimal value the doc comment claims it is.
    const nextLowest = Math.round((SCRIM_ALPHA - 0.1) * 10) / 10;
    const stillPasses = Object.values(ALL_TINTS).every(
      (hex) => contrastRatio(compositeOverBlack(hex, nextLowest), INK_LIGHT) >= 4.5,
    );
    expect(stillPasses).toBe(false);
  });
});

// app/_lib/category-tint.ts
// Solid tile colors for the category strip, replacing the old image-under-
// gradient tiles (every category resolved to a similar cream product photo, so
// the six tiles read as six copies of the same muddy tile).
//
// getDesigns() reads arbitrary rows from the database — the seed ships only
// `cat` and `dino` — so an unnamed slug is the normal case and gets a stable
// hash-picked color from the same palette rather than a blank tile.

/** Department tile tints, from the storefront canvas `DEPTS`. */
export const DEPARTMENT_TINTS: Record<string, string> = {
  men: "#B7C7D6",
  women: "#EFC4C4",
  plain: "#DEDAD2",
  accessories: "#C4906E",
};

/**
 * Design tile tints, from the canvas `DESIGN_HEX`.
 *
 * `cap` deliberately departs from the canvas. `#8E7A66` reaches only 3.51:1
 * against INK_LIGHT and 3.32:1 against INK_DARK — no ink choice clears AA.
 * Lightened to #A59585 (4.69:1 against INK_DARK), which also keeps it
 * consistent with every other tint resolving to dark ink. See spec §8.
 */
export const DESIGN_TINTS: Record<string, string> = {
  // women
  bear: "#C4906E", cat: "#EFC4C4", dino: "#AEBBA0", dog: "#D9B99B",
  feathers: "#CBBBD6", heart: "#E9AFB4", "just-grow": "#BFC7A6",
  looney: "#E5C98F", panda: "#DEDAD2", penguin: "#B7C7D6",
  sealovers: "#9FBFC4", snoopy: "#E4DCC6", stitch: "#A8C0D8",
  butterfly: "#D8C0DA", love: "#E7B7B7", paris: "#DCC9B0",
  // men
  car: "#AEC3D1", simpsons: "#E8CE7A",
  // plain
  oversized: "#D3CCC0", regular: "#B9BFB2",
  // accessories
  tote: "#C9B79A", cap: "#A59585", socks: "#D6C7B8",
};

export const ALL_TINTS: Record<string, string> = { ...DEPARTMENT_TINTS, ...DESIGN_TINTS };

export const TINT_PALETTE = Object.values(DESIGN_TINTS) as readonly string[];

/** Dark ink. Darkened from the handoff's #3a332c so the darkest tint
 *  (bear #C4906E) clears AA 4.5:1 — it reaches 4.90:1 here, vs 4.47:1 before. */
export const INK_DARK = "#332d26";
export const INK_LIGHT = "#F1EDE4";

export function tintForSlug(slug: string): string {
  const named = ALL_TINTS[slug];
  if (named) return named;
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  return TINT_PALETTE[Math.abs(hash) % TINT_PALETTE.length];
}

/** WCAG relative luminance of a `#rrggbb` color. */
export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between two `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Ink for a tile, chosen by whichever of the two inks actually contrasts
 * better — NOT by a luminance threshold. A threshold at 0.5 would send dino
 * (0.471) and bear (0.328) to the light ink at 1.73:1 and 2.38:1.
 */
export function inkFor(bgHex: string): string {
  return contrastRatio(INK_DARK, bgHex) >= contrastRatio(INK_LIGHT, bgHex)
    ? INK_DARK
    : INK_LIGHT;
}

/**
 * Opacity of the black scrim a photo tile paints over its tint, everywhere
 * the label can sit. A tile with a photo always uses INK_LIGHT (see TintTile)
 * instead of measuring contrast against the tint, because contrast against
 * the tint says nothing once a photograph covers it. But if the photo never
 * paints — slow load, broken URL, rejected host — the label sits on the tint
 * composited with this scrim alone, so that composite must itself clear
 * 4.5:1 against INK_LIGHT for every named tint. 0.6 is the smallest value (to
 * one decimal place) for which it does; the worst case is snoopy (#E4DCC6),
 * which reaches 6.09:1 at 0.6 but only 4.36:1 at 0.5. See the "clears AA
 * against INK_LIGHT through the scrim alone" test in taxonomy-tint.test.ts.
 */
export const SCRIM_ALPHA = 0.6;

/**
 * The color produced by painting a black layer of the given opacity over a
 * `#rrggbb` color — i.e. what a photo tile's tint looks like underneath its
 * scrim if the photo itself never paints. Pure alpha compositing: black
 * contributes nothing to any channel, so each channel is simply scaled by
 * `1 - alpha`.
 */
export function compositeOverBlack(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(v * (1 - alpha)),
  );
  return "#" + channels.map((c) => c.toString(16).padStart(2, "0")).join("");
}

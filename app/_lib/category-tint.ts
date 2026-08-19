// app/_lib/category-tint.ts
// Solid tile colors for the category strip, replacing the old image-under-
// gradient tiles (every category resolved to a similar cream product photo, so
// the six tiles read as six copies of the same muddy tile).
//
// getCategories() reads arbitrary rows from the database — the seed ships only
// `cat` and `dino` — so an unnamed slug is the normal case and gets a stable
// hash-picked color from the same palette rather than a blank tile.

export const CATEGORY_TINTS: Record<string, string> = {
  cat: "#EFC4C4",
  dino: "#AEBBA0",
  bear: "#C4906E",
  retro: "#E4D3B0",
  wave: "#AEC3D1",
  nature: "#BFC7A6",
};

export const TINT_PALETTE = Object.values(CATEGORY_TINTS) as readonly string[];

/** Dark ink. Darkened from the handoff's #3a332c so the darkest tint
 *  (bear #C4906E) clears AA 4.5:1 — it reaches 4.90:1 here, vs 4.47:1 before. */
export const INK_DARK = "#332d26";
export const INK_LIGHT = "#F1EDE4";

export function tintForSlug(slug: string): string {
  const named = CATEGORY_TINTS[slug];
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

function contrast(a: string, b: string): number {
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
  return contrast(INK_DARK, bgHex) >= contrast(INK_LIGHT, bgHex)
    ? INK_DARK
    : INK_LIGHT;
}

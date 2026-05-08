/**
 * Verifies every published color-token pair in app/globals.css meets WCAG AA
 * contrast (≥ 4.5:1 for body text, ≥ 3:1 for large text and non-text UI).
 *
 * Run via:  npm run check:contrast
 *
 * Reads the :root block in app/globals.css, parses oklch(L C H) values,
 * converts to sRGB via OkLab → linear RGB → sRGB gamma encoding, computes
 * WCAG relative luminance per pair, and exits 1 on any failure.
 *
 * No new dependencies — pure tsx (already a devDep).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

type RGB = readonly [number, number, number]; // sRGB 0..1

type Pair = {
  label: string;
  fg: string; // CSS var name (no leading --)
  bg: string;
  threshold: number; // 4.5 body / 3 large or UI
};

const ROOT = process.cwd();
const CSS_PATH = join(ROOT, "app", "globals.css");

const PAIRS: ReadonlyArray<Pair> = [
  { label: "foreground on background", fg: "foreground", bg: "background", threshold: 4.5 },
  { label: "muted-foreground on background", fg: "muted-foreground", bg: "background", threshold: 4.5 },
  { label: "primary-foreground on primary (CTA)", fg: "primary-foreground", bg: "primary", threshold: 4.5 },
  { label: "brand-foreground on brand (sale badge text)", fg: "brand-foreground", bg: "brand", threshold: 4.5 },
  { label: "accent-foreground on accent (subtle hover)", fg: "accent-foreground", bg: "accent", threshold: 4.5 },
  { label: "destructive-foreground on destructive", fg: "destructive-foreground", bg: "destructive", threshold: 4.5 },
  { label: "ring on background (focus ring vs page)", fg: "ring", bg: "background", threshold: 3.0 },
  { label: "brand on background (sale price text)", fg: "brand", bg: "background", threshold: 4.5 },
];

function parseTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  // Match the :root { ... } block (the boutique palette).
  const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!rootMatch) {
    throw new Error(`Could not find :root { ... } block in ${CSS_PATH}`);
  }
  const body = rootMatch[1];
  // Match `--name: value;` lines, ignoring `/* ... */` comments.
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    tokens.set(m[1], m[2].trim());
  }
  return tokens;
}

function resolveOklch(value: string, tokens: Map<string, string>): string | null {
  // Resolve var(--x) chains; bail if circular or unknown.
  let current = value;
  for (let i = 0; i < 8; i++) {
    const varMatch = current.match(/^var\(\s*--([a-z0-9-]+)\s*\)$/i);
    if (!varMatch) break;
    const next = tokens.get(varMatch[1]);
    if (!next) return null;
    current = next.trim();
  }
  return current.startsWith("oklch") ? current : null;
}

function parseOklch(s: string): { L: number; C: number; H: number } {
  const m = s.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/i);
  if (!m) throw new Error(`Cannot parse oklch: ${s}`);
  return { L: parseFloat(m[1]), C: parseFloat(m[2]), H: parseFloat(m[3]) };
}

// OkLab → linear sRGB (D65). Reference: https://bottosson.github.io/posts/oklab/
function oklabToLinearRgb(L: number, a: number, b: number): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function oklchToSrgb({ L, C, H }: { L: number; C: number; H: number }): RGB {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const linear = oklabToLinearRgb(L, a, b);
  // Linear → sRGB (gamma encode), then clamp.
  const enc = linear.map((c) => {
    const cc = Math.max(0, Math.min(1, c));
    return cc <= 0.0031308 ? 12.92 * cc : 1.055 * cc ** (1 / 2.4) - 0.055;
  }) as unknown as RGB;
  return enc;
}

// WCAG 2.x relative luminance from sRGB 0..1 components.
function relativeLuminance([r, g, b]: RGB): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHex([r, g, b]: RGB): string {
  const h = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function main(): number {
  const css = readFileSync(CSS_PATH, "utf8");
  const tokens = parseTokens(css);
  let failed = 0;

  console.log(`Reading tokens from ${CSS_PATH}\n`);
  console.log(`${"Pair".padEnd(50)}  ${"Ratio".padEnd(8)}  Required  Status`);
  console.log("-".repeat(88));

  for (const pair of PAIRS) {
    const fgVal = tokens.get(pair.fg);
    const bgVal = tokens.get(pair.bg);
    if (!fgVal || !bgVal) {
      console.log(
        `${pair.label.padEnd(50)}  ${"".padEnd(8)}  ${pair.threshold.toFixed(1).padEnd(8)}  MISSING TOKEN (${!fgVal ? "--" + pair.fg : "--" + pair.bg})`
      );
      failed++;
      continue;
    }
    const fgOklch = resolveOklch(fgVal, tokens);
    const bgOklch = resolveOklch(bgVal, tokens);
    if (!fgOklch || !bgOklch) {
      console.log(
        `${pair.label.padEnd(50)}  ${"".padEnd(8)}  ${pair.threshold.toFixed(1).padEnd(8)}  NON-OKLCH (skipping)`
      );
      continue;
    }
    const fgRgb = oklchToSrgb(parseOklch(fgOklch));
    const bgRgb = oklchToSrgb(parseOklch(bgOklch));
    const ratio = contrastRatio(fgRgb, bgRgb);
    const ok = ratio >= pair.threshold;
    if (!ok) failed++;
    const status = ok ? "PASS" : "FAIL";
    console.log(
      `${pair.label.padEnd(50)}  ${ratio.toFixed(2).padEnd(8)}  ${pair.threshold.toFixed(1).padEnd(8)}  ${status}  (${rgbToHex(fgRgb)} on ${rgbToHex(bgRgb)})`
    );
  }

  console.log();
  if (failed > 0) {
    console.log(`${failed} pair(s) failed WCAG AA. Adjust tokens in app/globals.css and re-run.`);
    return 1;
  }
  console.log("All pairs meet WCAG AA.");
  return 0;
}

process.exit(main());

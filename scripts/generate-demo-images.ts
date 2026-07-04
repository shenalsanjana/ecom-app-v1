// scripts/generate-demo-images.ts
// Run with: npx tsx scripts/generate-demo-images.ts
//
// Generates one demo product SVG per item in mock data, color-matched to the
// product name. Files land in public/products/<id>/main.svg and are served as
// /products/<id>/main.svg by Next.js. Replace these with real product photos
// (e.g. main.jpg + 1.jpg..4.jpg) when available — seed.ts picks JPGs over the
// SVG fallback automatically.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { catalogProducts } from "../app/_data/mock";

type Look = {
  id: string;
  name: string;
  fill: string;     // shirt body color
  accent?: string;  // optional accent (rib, graphic)
  bg: string;       // background swatch
  pattern?: "stripes" | "tieDye" | "wash";
  graphic?: string; // text printed on the chest
  contrastText: string;
};

const LOOKS: Record<string, Omit<Look, "id" | "name">> = {
  p1: { fill: "#1a1a1a", accent: "#2b2b2b", bg: "#f5f5f4", contrastText: "#fafafa" },
  p2: { fill: "#1e3a5f", accent: "#2b4a73", bg: "#eff3f8", pattern: "wash", contrastText: "#e8eef5" },
  p3: { fill: "#fafafa", accent: "#1a1a1a", bg: "#f0f0ef", pattern: "stripes", contrastText: "#1a1a1a" },
  p4: { fill: "#a8a8a8", accent: "#919191", bg: "#f4f4f4", contrastText: "#2b2b2b" },
  p5: { fill: "#111111", accent: "#fafafa", bg: "#ededec", graphic: "URBAN", contrastText: "#fafafa" },
  p6: { fill: "#fafafa", accent: "#222222", bg: "#f0f0ef", graphic: "DB", contrastText: "#1a1a1a" },
  p7: { fill: "#6b7280", accent: "#838b96", bg: "#eef0f3", pattern: "wash", contrastText: "#fafafa" },
  p8: { fill: "#36393d", accent: "#4a4d52", bg: "#f0f0f1", contrastText: "#fafafa" },
  d1: { fill: "#5a6741", accent: "#6f7d54", bg: "#f0f1ec", pattern: "wash", contrastText: "#fafafa" },
  d2: { fill: "#d3a3a3", accent: "#bd8b8b", bg: "#faf3f3", contrastText: "#3a1f1f" },
  d3: { fill: "#c8b8a0", accent: "#b09e84", bg: "#f7f2eb", contrastText: "#3a2e1e" },
  d4: { fill: "#7a4eb5", accent: "#e85d75", bg: "#f5eef9", pattern: "tieDye", contrastText: "#fafafa" },
};

const SHIRT_PATH =
  "M 180,140 L 240,110 C 280,170, 320,170, 360,110 L 420,140 L 510,200 L 480,250 L 430,230 L 430,510 L 170,510 L 170,230 L 120,250 L 90,200 Z";

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      case "'": return "&apos;";
      default: return c;
    }
  });
}

function svg(look: Look): string {
  const { fill, accent, bg, pattern, graphic, contrastText, name } = look;

  const defs: string[] = [];

  if (pattern === "stripes") {
    defs.push(`
      <pattern id="stripes-${look.id}" patternUnits="userSpaceOnUse" width="36" height="36" patternTransform="rotate(0)">
        <rect width="36" height="36" fill="${fill}"/>
        <rect x="0" y="0" width="36" height="18" fill="${accent ?? "#1a1a1a"}"/>
      </pattern>
    `);
  }
  if (pattern === "tieDye") {
    defs.push(`
      <radialGradient id="tieDye-${look.id}" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#ffd166"/>
        <stop offset="35%" stop-color="${accent ?? "#e85d75"}"/>
        <stop offset="70%" stop-color="${fill}"/>
        <stop offset="100%" stop-color="#1a1a1a"/>
      </radialGradient>
    `);
  }
  if (pattern === "wash") {
    defs.push(`
      <linearGradient id="wash-${look.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${accent ?? fill}"/>
        <stop offset="100%" stop-color="${fill}"/>
      </linearGradient>
      <filter id="washNoise-${look.id}">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${look.id.length * 7}"/>
        <feColorMatrix values="0 0 0 0 1   0 0 0 0 1   0 0 0 0 1   0 0 0 0.05 0"/>
        <feComposite in2="SourceGraphic" operator="in"/>
      </filter>
    `);
  }

  const shirtFill =
    pattern === "stripes" ? `url(#stripes-${look.id})` :
    pattern === "tieDye" ? `url(#tieDye-${look.id})` :
    pattern === "wash" ? `url(#wash-${look.id})` :
    fill;

  const washOverlay =
    pattern === "wash"
      ? `<path d="${SHIRT_PATH}" fill="white" filter="url(#washNoise-${look.id})" opacity="0.4"/>`
      : "";

  const graphicSvg = graphic
    ? `<text x="300" y="345" font-family="Impact, Arial Black, sans-serif" font-size="56" font-weight="900" letter-spacing="2" text-anchor="middle" fill="${contrastText}">${escapeXml(graphic)}</text>`
    : "";

  // Neckline rib detail.
  const neckline = `<path d="M 252,118 C 285,160, 315,160, 348,118" fill="none" stroke="${accent ?? fill}" stroke-width="3" stroke-linecap="round"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="${escapeXml(name)}">
  <defs>${defs.join("")}</defs>
  <rect width="600" height="600" fill="${bg}"/>
  <g>
    <path d="${SHIRT_PATH}" fill="${shirtFill}" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>
    ${washOverlay}
    ${neckline}
    ${graphicSvg}
  </g>
  <text x="300" y="568" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="18" font-weight="600" text-anchor="middle" fill="#3f3f46">${escapeXml(name)}</text>
</svg>`;
}

function main() {
  const all = catalogProducts;
  const root = resolve(process.cwd(), "public", "products");
  let written = 0;
  let skipped = 0;

  for (const p of all) {
    const look = LOOKS[p.id];
    if (!look) {
      console.warn(`No look defined for ${p.id} — skipping`);
      continue;
    }

    const dir = join(root, p.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const out = join(dir, "main.svg");
    if (existsSync(out) && process.env.FORCE !== "1") {
      skipped++;
      continue;
    }

    writeFileSync(out, svg({ id: p.id, name: p.name, ...look }), "utf8");
    written++;
  }

  console.log(`Demo product images: wrote ${written}, skipped ${skipped} (use FORCE=1 to overwrite).`);
}

main();

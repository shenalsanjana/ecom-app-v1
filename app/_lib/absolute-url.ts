// app/_lib/absolute-url.ts
// Single source of truth for canonical absolute URLs (OG images, feed links,
// share URLs, JSON-LD). Mirrors the APP_URL default used in app/layout.tsx.
const APP_URL = process.env.APP_URL || "http://localhost:3000";

export function absoluteUrl(path: string): string {
  const base = APP_URL.replace(/\/+$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  return `${base}${rel}`;
}

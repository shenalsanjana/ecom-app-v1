export const PRODUCT_TABS = ["all", "published", "draft", "low-stock", "archived"] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number] | "active";

export function parseProductTab(value?: string | null): (typeof PRODUCT_TABS)[number] {
  if (value === "active") return "published";
  return PRODUCT_TABS.find(tab => tab === value) ?? "all";
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await exists(base))) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
}

export function parseSizes(csv: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of csv.split(",")) {
    const s = part.trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export function serializeSizes(list: string[]): string {
  return parseSizes(list.join(",")).join(",");
}

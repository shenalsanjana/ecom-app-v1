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

import type { Prisma } from "@prisma/client";

export const LOW_STOCK_THRESHOLD = 5;

export const PRODUCT_TABS = ["active", "low-stock", "archived", "all"] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

export type ProductListParams = {
  tab?: ProductTab;
  category?: string;
  q?: string;
};

export function buildProductWhere(params: ProductListParams): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  switch (params.tab) {
    case "low-stock":
      where.archived = false;
      where.stock = { lte: LOW_STOCK_THRESHOLD };
      break;
    case "archived":
      where.archived = true;
      break;
    case "all":
      break;
    case "active":
    default:
      where.archived = false;
  }

  if (params.category) where.categorySlug = params.category;

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { id: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

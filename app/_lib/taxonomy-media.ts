// app/_lib/taxonomy-media.ts
import { unstable_cache } from "next/cache";
import { prisma } from "@/app/_lib/prisma";

/** Up to this many photos rotate on a design tile. */
export const MAX_SLIDES = 4;

export type DesignMedia = { photos: string[]; count: number };

/** One non-archived product, with its default variant's first CARD image. */
export type ProductMediaRow = {
  designSlug: string;
  variants: { images: { url: string }[] }[];
};

/**
 * Photos and product counts per design. Pure, and separate from the query, so
 * the arithmetic is testable without a database -- the same split
 * `taxonomy-counts.ts` uses.
 *
 * The row set IS the non-archived products, so counting rows gives the caption
 * and the first `maxSlides` urls give the slides. A product with no variant, or
 * a variant with no CARD image, still counts but contributes no photo.
 */
export function designMedia(
  rows: ProductMediaRow[],
  maxSlides: number = MAX_SLIDES,
): Map<string, DesignMedia> {
  const media = new Map<string, DesignMedia>();
  for (const row of rows) {
    const entry = media.get(row.designSlug) ?? { photos: [], count: 0 };
    entry.count += 1;
    const url = row.variants[0]?.images[0]?.url;
    if (url && entry.photos.length < maxSlides) entry.photos.push(url);
    media.set(row.designSlug, entry);
  }
  return media;
}

/**
 * Read only by the home route. Deliberately NOT folded into getDepartments():
 * the footer calls that on every page, so nesting product -> variant -> image
 * into it would slow ~20 routes for data only this one reads.
 *
 * Tagged "catalog", which the admin actions already bust with
 * revalidateTag("catalog", "max") -- no new invalidation is introduced.
 */
export const getDesignMedia = unstable_cache(
  async (): Promise<Map<string, DesignMedia>> => {
    const rows = await prisma.product.findMany({
      where: { archived: false },
      orderBy: [{ designSlug: "asc" }, { id: "asc" }], // deterministic slide order
      select: {
        designSlug: true,
        variants: {
          where: { archived: false },
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: {
            images: {
              where: { role: "CARD" },
              orderBy: { sortOrder: "asc" },
              take: 1,
              select: { url: true },
            },
          },
        },
      },
    });
    return designMedia(rows);
  },
  ["design-media"],
  { tags: ["catalog", "products"], revalidate: 3600 },
);

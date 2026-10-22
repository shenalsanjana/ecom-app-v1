/** Product counts for the browse filter tree. Kept pure and separate from the
 *  page so the arithmetic is testable without a database. */

import { productCollections, type CollectionProduct } from "@/app/_lib/product-collections";

export function countsByDesign(products: CollectionProduct[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of products) for (const slug of productCollections(p)) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  return counts;
}

/** Zero, not absent, for a department with no products: the sidebar prints the
 *  number directly and `undefined` would render as nothing at all. */
export function countsByDepartment(
  departments: { slug: string; designs: { slug: string }[] }[],
  products: CollectionProduct[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of departments) {
    const slugs = new Set(d.designs.map(design => design.slug));
    counts.set(d.slug, products.filter(product => productCollections(product).some(slug => slugs.has(slug))).length);
  }
  return counts;
}

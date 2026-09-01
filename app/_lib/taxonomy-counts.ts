/** Product counts for the browse filter tree. Kept pure and separate from the
 *  page so the arithmetic is testable without a database. */

/** `category` is the product's design slug — see ProductView in products.ts. */
export function countsByDesign(products: { category: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return counts;
}

/** Zero, not absent, for a department with no products: the sidebar prints the
 *  number directly and `undefined` would render as nothing at all. */
export function countsByDepartment(
  departments: { slug: string; designs: { slug: string }[] }[],
  byDesign: Map<string, number>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of departments) {
    counts.set(d.slug, d.designs.reduce((sum, g) => sum + (byDesign.get(g.slug) ?? 0), 0));
  }
  return counts;
}

import { designPath } from "@/app/_lib/taxonomy-path";

export type Crumb = { label: string; href?: string };

type TrailInput = {
  department?: { slug: string; name: string; subName: string | null } | null;
  design?: { slug: string; name: string } | null;
  productName?: string | null;
};

/** Shop the collection › Department › [sub-category] › [Design] › [Product].
 *
 *  One crumb at the root, not two: this used to open "Home › Categories", and
 *  those became the same page when the catalogue moved onto "/". It carries
 *  the catalogue's name rather than "Home" so the root reads the same here as
 *  it does in the header nav and the mobile sheet.
 *
 *  Two rules the callers rely on:
 *  - The sub-category is never a link and appears only alongside a design.
 *    `subName` is a column on the department, not a level in the URL, and on a
 *    department's own page it would otherwise push that page's crumb into
 *    linking to itself.
 *  - The final crumb never carries an href — it is the page you are on. */
export function taxonomyTrail({ department, design, productName }: TrailInput): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Shop the collection", href: "/" }];

  if (department) {
    crumbs.push({ label: department.name, href: `/categories/${department.slug}` });
    // A design cannot be linked without its department, so both are required.
    if (design) {
      if (department.subName) crumbs.push({ label: department.subName });
      crumbs.push({ label: design.name, href: designPath(department.slug, design.slug) });
    }
  }

  if (productName) crumbs.push({ label: productName });

  const last = crumbs[crumbs.length - 1];
  crumbs[crumbs.length - 1] = { label: last.label };
  return crumbs;
}

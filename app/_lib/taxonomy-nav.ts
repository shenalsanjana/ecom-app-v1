import { designPath } from "@/app/_lib/taxonomy-path";
import { showsNavDropdown, type DepartmentView } from "@/app/_lib/taxonomy";
import { MIN_MEGA_MENU_COLUMNS, type NavColumn } from "@/app/_lib/taxonomy-nav-model";

// Re-exported so existing server-side callers and tests can keep reaching
// the constant and the type through this module. The client leaf
// (`mega-menu.tsx`) must NOT do the same — it imports both directly from
// `taxonomy-nav-model` instead, so its bundle never touches this file (which
// value-imports `showsNavDropdown` from `@/app/_lib/taxonomy`, and so would
// drag Prisma along).
export { MIN_MEGA_MENU_COLUMNS };
export type { NavColumn };

/** Server-side only: this module reaches `@/app/_lib/taxonomy`, which imports
 *  Prisma. The header calls it and passes the plain result to the client leaf. */
export function navColumns(departments: DepartmentView[]): NavColumn[] {
  return departments.filter(showsNavDropdown).map((d) => ({
    label: d.navLabel,
    href: `/categories/${d.slug}`,
    designs: d.designs.map((g) => ({ label: g.name, href: designPath(d.slug, g.slug) })),
  }));
}

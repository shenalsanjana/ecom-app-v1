import { designPath } from "@/app/_lib/taxonomy-path";
import { showsNavDropdown, type DepartmentView } from "@/app/_lib/taxonomy";

export type NavColumn = {
  label: string;
  href: string;
  designs: { label: string; href: string }[];
};

/** Below this many columns the panel is one lonely list, which is a worse
 *  affordance than a plain link to the browse page. Production has one
 *  qualifying department today. */
export const MIN_MEGA_MENU_COLUMNS = 2;

/** Server-side only: this module reaches `@/app/_lib/taxonomy`, which imports
 *  Prisma. The header calls it and passes the plain result to the client leaf. */
export function navColumns(departments: DepartmentView[]): NavColumn[] {
  return departments.filter(showsNavDropdown).map((d) => ({
    label: d.navLabel,
    href: `/categories/${d.slug}`,
    designs: d.designs.map((g) => ({ label: g.name, href: designPath(d.slug, g.slug) })),
  }));
}

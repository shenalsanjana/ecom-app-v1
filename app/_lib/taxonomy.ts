import { unstable_cache } from "next/cache";
import { prisma } from "@/app/_lib/prisma";
import { designPath } from "@/app/_lib/taxonomy-path";
export { designPath };

export type DesignSummary = { slug: string; name: string; hex: string };

export type DepartmentView = {
  slug: string;
  name: string;
  navLabel: string;
  tileName: string;
  note: string | null;
  subName: string | null;
  hex: string;
  sortOrder: number;
  designs: DesignSummary[];
};

/** A department shows a nav dropdown when it has designs to list. */
export function showsNavDropdown(d: DepartmentView): boolean {
  return d.designs.length > 0;
}

/** A department appears in "Shop by design" only when it names a
 *  sub-category AND has designs — matching the canvas's own condition. */
export function showsInDesignSection(d: DepartmentView): boolean {
  return d.subName !== null && d.designs.length > 0;
}

export const getDepartments = unstable_cache(
  async (): Promise<DepartmentView[]> => {
    const rows = await prisma.department.findMany({
      orderBy: { sortOrder: "asc" },
      include: { designs: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { slug: true, name: true, hex: true } } },
    });
    return rows.map((d) => ({
      slug: d.slug, name: d.name, navLabel: d.navLabel, tileName: d.tileName,
      note: d.note, subName: d.subName, hex: d.hex, sortOrder: d.sortOrder,
      designs: d.designs,
    }));
  },
  ["departments-list"],
  { tags: ["catalog", "departments"], revalidate: 3600 },
);

export async function getDesignPathRedirect(oldSlug: string): Promise<string | null> {
  const row = await prisma.designSlugHistory.findUnique({
    where: { oldSlug },
    select: { design: { select: { slug: true, departmentSlug: true } } },
  });
  return row ? designPath(row.design.departmentSlug, row.design.slug) : null;
}

export async function getDepartmentSlugRedirect(oldSlug: string): Promise<string | null> {
  const row = await prisma.departmentSlugHistory.findUnique({
    where: { oldSlug },
    select: { currentSlug: true },
  });
  return row ? `/categories/${row.currentSlug}` : null;
}

import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";
import { DepartmentCard } from "@/app/_components/home/department-card";
import type { Slide } from "@/app/_components/ui/slide-show";
import { showsNavDropdown, type DepartmentView } from "@/app/_lib/taxonomy";

/** Below this many linked departments the grid reads as a bug rather than a
 *  catalog, so the section renders nothing at all. */
export const MIN_DEPARTMENT_CARDS = 2;

/** One slide per design under the department -- a re-projection of data the
 *  page has already paid for, so this costs no query. */
export function departmentSlides(d: DepartmentView): Slide[] {
  return d.designs.map((g) => ({ hex: g.hex, photo: g.image, label: g.name }));
}

/** The prototype's "N products" branch is unreachable here: the section only
 *  renders departments passing showsNavDropdown, so designs is never empty.
 *  Singularises "1 design" -- the prototype's own `designs + ' designs'`
 *  read "1 designs" for a one-design department, and that grammar bug is not
 *  something worth carrying into production, especially next to Task 6's
 *  productNote, which singularises the same way inches away on the page. */
export function departmentNote(d: DepartmentView): string {
  const n = d.designs.length;
  return d.note ?? `${n} ${n === 1 ? "design" : "designs"}`;
}

export function DepartmentCards({ departments }: { departments: DepartmentView[] }) {
  const linked = departments.filter(showsNavDropdown);
  if (linked.length < MIN_DEPARTMENT_CARDS) return null;

  return (
    <Section>
      <SectionHeader title="Shop by category" />
      {/* No SlideClock here: it's hoisted to page.tsx so this section and
          DesignGrid's rotating tiles share exactly one interval -- see
          taxonomy-tile-slides/spec.md's "one shared timer" requirement. */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6">
        {linked.map((d) => (
          <li key={d.slug}>
            <DepartmentCard
              href={`/categories/${d.slug}`}
              name={d.tileName}
              note={departmentNote(d)}
              slides={departmentSlides(d)}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

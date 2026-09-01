import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";
import { SlideClock } from "@/app/_components/ui/slide-clock";
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
 *  renders departments passing showsNavDropdown, so designs is never empty. */
export function departmentNote(d: DepartmentView): string {
  return d.note ?? `${d.designs.length} designs`;
}

export function DepartmentCards({ departments }: { departments: DepartmentView[] }) {
  const linked = departments.filter(showsNavDropdown);
  if (linked.length < MIN_DEPARTMENT_CARDS) return null;

  return (
    <Section>
      <SectionHeader title="Shop by category" />
      <SlideClock>
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
      </SlideClock>
    </Section>
  );
}

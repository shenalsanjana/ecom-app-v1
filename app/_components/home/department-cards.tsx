import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";
import { TintTile } from "@/app/_components/ui/tint-tile";
import { showsNavDropdown, type DepartmentView } from "@/app/_lib/taxonomy";

/** Below this many linked departments the four-up grid reads as a bug rather
 *  than a catalog, so the section renders nothing at all. Production ships four
 *  departments but designs under only one, and `scripts/deploy.sh` never seeds. */
export const MIN_DEPARTMENT_CARDS = 2;

export function DepartmentCards({ departments }: { departments: DepartmentView[] }) {
  // showsNavDropdown is the spec's derived rule: never link a department that
  // holds no designs, or the tile leads to an indexable "Nothing here yet." page.
  const linked = departments.filter(showsNavDropdown);
  if (linked.length < MIN_DEPARTMENT_CARDS) return null;

  return (
    <Section>
      <SectionHeader title="Shop by category" />
      <ul className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {linked.map((d) => (
          <li key={d.slug}>
            <TintTile
              href={`/categories/${d.slug}`}
              label={d.tileName}
              subLabel={d.note}
              hex={d.hex}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

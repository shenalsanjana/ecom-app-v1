import { Eyebrow } from "@/app/_components/ui/eyebrow";
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";
import { TintTile } from "@/app/_components/ui/tint-tile";
import { designPath, showsInDesignSection, type DepartmentView } from "@/app/_lib/taxonomy";

/** One qualifying department is enough: production has exactly one, and a
 *  single named group still reads as a catalog rather than as a broken grid. */
export const MIN_DESIGN_GROUPS = 1;

export function DesignGrid({ departments }: { departments: DepartmentView[] }) {
  // showsInDesignSection is `subName !== null && designs.length > 0` — the
  // departments with no sub-category are excluded deliberately.
  const groups = departments.filter(showsInDesignSection);
  if (groups.length < MIN_DESIGN_GROUPS) return null;

  return (
    <Section>
      <SectionHeader title="Shop by design" />
      <div className="space-y-12">
        {groups.map((d) => (
          <div key={d.slug}>
            {/* Men and Women share a subName, so the department name is what
                identifies a group. The two always render as a pair. */}
            <Eyebrow className="mb-1">{d.name}</Eyebrow>
            <h3 className="font-heading text-xl font-semibold tracking-tight">{d.subName}</h3>
            <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              {d.designs.map((design) => (
                <li key={design.slug}>
                  <TintTile
                    href={designPath(d.slug, design.slug)}
                    label={design.name}
                    hex={design.hex}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

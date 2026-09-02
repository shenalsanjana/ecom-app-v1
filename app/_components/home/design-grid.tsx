import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";
import { DesignTile } from "@/app/_components/home/design-tile";
import type { Slide } from "@/app/_components/ui/slide-show";
import type { DesignMedia } from "@/app/_lib/taxonomy-media";
import {
  designPath, showsInDesignSection,
  type DepartmentView, type DesignSummary,
} from "@/app/_lib/taxonomy";

/** One qualifying department is enough: production has exactly one. */
export const MIN_DESIGN_GROUPS = 1;

/** Product photos first; then the design's own image; then a tint-only slide
 *  carrying the name, so a design with no photography still reads. */
export function designSlides(design: DesignSummary, media: DesignMedia | undefined): Slide[] {
  if (media && media.photos.length > 0) {
    return media.photos.map((photo) => ({ hex: design.hex, photo }));
  }
  if (design.image) return [{ hex: design.hex, photo: design.image }];
  return [{ hex: design.hex, photo: null, title: design.name }];
}

/** Empty string, not "0 products", when a design's products are all
 *  archived: a live tile printing a zero count reads as broken, not honest. */
export function productNote(count: number): string {
  if (count === 0) return "";
  return `${count} ${count === 1 ? "product" : "products"}`;
}

/** Singularises the same way productNote does, inches above it on the tile
 *  below -- department-cards.tsx's departmentNote was fixed for the same
 *  bug in the previous task; a group holding exactly one design must not
 *  read "1 designs" next to a tile that correctly reads "1 product". */
export function designCountNote(count: number): string {
  return `${count} ${count === 1 ? "design" : "designs"}`;
}

export function DesignGrid({
  departments, media,
}: {
  departments: DepartmentView[];
  media: Map<string, DesignMedia>;
}) {
  const groups = departments.filter(showsInDesignSection);
  if (groups.length < MIN_DESIGN_GROUPS) return null;

  // subName is shared by Men and Women today, so it names the section; the
  // department name names each group. But a future department with a
  // different sub-name must not be silently folded under the first group's
  // label -- the eyebrow is only trustworthy when every group agrees.
  const eyebrow = groups.every((g) => g.subName === groups[0].subName)
    ? (groups[0].subName ?? undefined)
    : undefined;

  return (
    <Section>
      <SectionHeader eyebrow={eyebrow} title="Shop by design" />
      {/* No SlideClock here: it's hoisted to page.tsx so this section and
          DepartmentCards' rotating tiles share exactly one interval -- see
          taxonomy-tile-slides/spec.md's "one shared timer" requirement. */}
      <div className="space-y-[34px]">
        {groups.map((d) => (
          <div key={d.slug}>
            <div className="mb-4 flex items-baseline gap-2.5">
              <h3 className="font-heading text-[15px] font-semibold">{d.name}</h3>
              <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                {designCountNote(d.designs.length)}
              </span>
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3.5">
              {d.designs.map((design) => (
                <li key={design.slug}>
                  <DesignTile
                    href={designPath(d.slug, design.slug)}
                    name={design.name}
                    note={productNote(media.get(design.slug)?.count ?? 0)}
                    slides={designSlides(design, media.get(design.slug))}
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

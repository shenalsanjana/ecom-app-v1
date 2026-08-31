import { designPath } from "@/app/_lib/taxonomy";

export type Resolution =
  | { kind: "department"; slug: string }
  | { kind: "design"; departmentSlug: string; designSlug: string }
  | { kind: "redirect"; to: string }
  | { kind: "notFound" };

export type TaxonomyLookup = {
  departmentExists(slug: string): boolean;
  designOf(slug: string): { departmentSlug: string } | null;
  departmentRedirect(slug: string): string | null;
  designRedirect(slug: string): string | null;
};

/**
 * Resolves /categories/* segments.
 *
 * One-segment order checks CURRENT designs before either history table.
 * `cat` and `dino` ship unrenamed, so they never enter DesignSlugHistory — a
 * history-only lookup would 404 the exact live URLs this migration preserves.
 *
 * For two segments the design slug is authoritative: the department segment is
 * corrected against the design's current department rather than trusted.
 */
export function resolveCategoryRoute(segments: string[], lookup: TaxonomyLookup): Resolution {
  if (segments.length === 1) {
    const [slug] = segments;
    if (lookup.departmentExists(slug)) return { kind: "department", slug };

    const design = lookup.designOf(slug);
    if (design) return { kind: "redirect", to: designPath(design.departmentSlug, slug) };

    const deptTo = lookup.departmentRedirect(slug);
    if (deptTo) return { kind: "redirect", to: deptTo };

    const designTo = lookup.designRedirect(slug);
    if (designTo) return { kind: "redirect", to: designTo };

    return { kind: "notFound" };
  }

  if (segments.length === 2) {
    const [deptSlug, designSlug] = segments;

    const design = lookup.designOf(designSlug);
    if (design) {
      return design.departmentSlug === deptSlug
        ? { kind: "design", departmentSlug: deptSlug, designSlug }
        : { kind: "redirect", to: designPath(design.departmentSlug, designSlug) };
    }

    const designTo = lookup.designRedirect(designSlug);
    if (designTo) return { kind: "redirect", to: designTo };

    return { kind: "notFound" };
  }

  return { kind: "notFound" };
}

// app/_lib/taxonomy-lookup.ts
//
// The glue between the async taxonomy reads and the pure route resolver.
//
// `resolveCategoryRoute` is synchronous by design — it is a pure module with no
// Prisma import — but the two slug-history tables are async reads. This module
// pre-resolves those reads into plain values and hands the resolver a total,
// synchronous `TaxonomyLookup`.
//
// It takes the history fetchers as PARAMETERS rather than importing them, so
// the whole resolution path is unit-testable with no database. Keep this module
// Prisma-free: it may only import the pure `taxonomy-route` / `taxonomy-path`
// leaves.

import { resolveCategoryRoute, type Resolution, type TaxonomyLookup } from "@/app/_lib/taxonomy-route";

/** The shape of the live taxonomy this module needs. `DepartmentView[]` from
 *  `taxonomy.ts` satisfies it structurally, as does any test double. */
export type DepartmentIndex = readonly {
  readonly slug: string;
  readonly designs: readonly { readonly slug: string }[];
}[];

/** The two slug-history reads, injected so tests need no database. */
export type SlugHistoryReaders = {
  departmentRedirect: (slug: string) => Promise<string | null>;
  designRedirect: (slug: string) => Promise<string | null>;
};

/** Segment counts the resolver can act on. Anything else is a miss, and must
 *  not cost a history query — see `resolveCategorySegments`. */
function isResolvableLength(segments: readonly string[]): boolean {
  return segments.length === 1 || segments.length === 2;
}

/**
 * Builds the synchronous lookup the resolver needs, pre-reading history only
 * for slugs that match nothing live.
 *
 * A slug that is a current department or design short-circuits inside
 * `resolveCategoryRoute` before either history branch is reached, so querying
 * for it would be pure waste. In practice that means every live URL — the
 * common case by far — issues zero history queries.
 */
export async function buildTaxonomyLookup(
  segments: readonly string[],
  departments: DepartmentIndex,
  history: SlugHistoryReaders,
): Promise<TaxonomyLookup> {
  const designToDept = new Map<string, string>();
  for (const d of departments) {
    for (const g of d.designs) designToDept.set(g.slug, d.slug);
  }

  const departmentExists = (slug: string) => departments.some((d) => d.slug === slug);
  const designOf = (slug: string) => {
    const departmentSlug = designToDept.get(slug);
    return departmentSlug ? { departmentSlug } : null;
  };

  // One segment resolves that segment; two resolve the design segment (the
  // department segment is corrected from the design, never looked up).
  const candidates = isResolvableLength(segments)
    ? segments.length === 1
      ? segments.slice(0, 1)
      : segments.slice(1, 2)
    : [];
  const misses = candidates.filter((s) => !departmentExists(s) && !designOf(s));

  // Keyed by slug, not by position. A positional array would be correct only
  // while `candidates` holds at most one entry; keying by slug means a future
  // branch that pre-resolves more than one segment cannot silently read the
  // wrong answer (or `-1`) and collapse a redirect into a 404.
  const [deptEntries, designEntries] = await Promise.all([
    Promise.all(misses.map(async (s) => [s, await history.departmentRedirect(s)] as const)),
    Promise.all(misses.map(async (s) => [s, await history.designRedirect(s)] as const)),
  ]);
  const deptHist = new Map<string, string | null>(deptEntries);
  const designHist = new Map<string, string | null>(designEntries);

  return {
    departmentExists,
    designOf,
    departmentRedirect: (s) => deptHist.get(s) ?? null,
    designRedirect: (s) => designHist.get(s) ?? null,
  };
}

/**
 * Resolves `/categories/*` segments against the live taxonomy.
 *
 * A segment count the resolver cannot act on (0, or 3+) returns `notFound`
 * before any history read — a deep crawl of `/categories/a/b/c` costs no
 * database round-trips.
 */
export async function resolveCategorySegments(
  segments: readonly string[],
  departments: DepartmentIndex,
  history: SlugHistoryReaders,
): Promise<Resolution> {
  if (!isResolvableLength(segments)) return { kind: "notFound" };
  const lookup = await buildTaxonomyLookup(segments, departments, history);
  return resolveCategoryRoute([...segments], lookup);
}

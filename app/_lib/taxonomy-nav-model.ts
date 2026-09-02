/** Zero-import plain-data model for the header nav. Deliberately isolated
 *  from `@/app/_lib/taxonomy-nav.ts` and `@/app/_lib/taxonomy.ts`: those pull
 *  in Prisma and `unstable_cache` at module scope, and a client component
 *  that value-imports anything from that chain — even a single unrelated
 *  export — puts the whole module's evaluation in its bundle (confirmed by
 *  inspecting the built client chunks; see the Task 4 fix report). This file
 *  has no imports at all, so nothing reachable from it can ever leak. */

export type NavColumn = {
  label: string;
  /** The department's qualifier ("Unisex"), printed beside the label in the
   *  nav. Null for departments whose name needs no qualifying. */
  note: string | null;
  href: string;
  designs: { label: string; href: string }[];
};

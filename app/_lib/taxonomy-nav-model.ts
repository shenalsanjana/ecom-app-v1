/** Zero-import plain-data model for the header nav. Deliberately isolated
 *  from `@/app/_lib/taxonomy-nav.ts` and `@/app/_lib/taxonomy.ts`: those pull
 *  in Prisma and `unstable_cache` at module scope, and a client component
 *  that value-imports anything from that chain — even a single unrelated
 *  export — puts the whole module's evaluation in its bundle (confirmed by
 *  inspecting the built client chunks; see the Task 4 fix report). This file
 *  has no imports at all, so nothing reachable from it can ever leak. */

export type NavColumn = {
  label: string;
  href: string;
  designs: { label: string; href: string }[];
};

/** Below this many columns the panel is one lonely list, which is a worse
 *  affordance than a plain link to the browse page. Production has one
 *  qualifying department today. */
export const MIN_MEGA_MENU_COLUMNS = 2;

"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

/** The browse rail, collapsed on a phone.
 *
 *  Nine rows of filters above the grid meant a phone scrolled past a screenful
 *  of controls before reaching a product. Unlike the design page, filters
 *  cannot simply move below the results — they govern what is shown — so they
 *  fold behind a button instead, with the count of what is currently applied
 *  on it so a narrowed list is never a mystery. At lg the rail is always open
 *  and this component adds nothing.
 *
 *  `children` and `sort` arrive already rendered from the page: this leaf holds
 *  the open/closed state and nothing else, so FilterRail stays a Server
 *  Component and Prisma never reaches this bundle. */
export function FilterDisclosure({
  activeCount,
  sort,
  children,
}: {
  activeCount: number;
  sort: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="browse-filters"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-(--duration-fast) hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-brand px-1.5 py-px text-xs tabular-nums text-brand-foreground">
              {activeCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          {/* Labels the control for sighted readers; the select carries its own
              accessible name, so this is not a <label>. */}
          <span aria-hidden="true" className="text-sm text-muted-foreground">Sort</span>
          {sort}
        </div>
      </div>

      <div id="browse-filters" className={`${open ? "block" : "hidden"} lg:block`}>
        {children}
      </div>
    </>
  );
}

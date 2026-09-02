"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavColumn } from "@/app/_lib/taxonomy-nav-model";

/** A flat row of department links — the merchandise, not the site structure.
 *
 *  Takes plain columns rather than DepartmentView rows: this is a Client
 *  Component (it reads the pathname to mark where you are), and
 *  `@/app/_lib/taxonomy` imports Prisma. The header does that work and passes
 *  the result down. The import above comes from `taxonomy-nav-model`, not
 *  `taxonomy-nav` — that module value-imports from `@/app/_lib/taxonomy`, and
 *  importing even one unrelated export from it pulls Prisma's evaluation into
 *  this client bundle. `taxonomy-nav-model` has zero imports, so nothing here
 *  can leak.
 *
 *  Five departments plus the brand and the icons overrun a tablet, so the row
 *  appears at lg and MobileNav's sheet carries the nav below that.
 *
 *  Each department's designs hang below it in a panel revealed by hover or by
 *  focus landing on the link — `group-focus-within` keeps the panel open while
 *  a keyboard user tabs through it, so no JavaScript state is involved. */

const ITEM =
  "flex h-full items-center gap-1.5 border-b-2 text-xs uppercase tracking-[0.12em] transition-colors duration-(--duration-fast)";
const ITEM_ACTIVE = "border-brand text-foreground";
const ITEM_IDLE = "border-transparent text-muted-foreground hover:text-brand";

type PlainLink = { href: string; label: string };

/** Past this many designs a single column runs past the fold — Women alone
 *  carries fifteen — so the panel splits in two. */
const PANEL_SPLITS_AT = 8;

export function DepartmentNav({
  columns,
  links = [],
}: {
  columns: NavColumn[];
  links?: PlainLink[];
}) {
  const pathname = usePathname();
  const isHere = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Departments" className="hidden h-full items-stretch gap-6 lg:flex">
      {columns.map((col) => (
        <div key={col.href} className="group relative flex items-stretch">
          <Link
            href={col.href}
            data-active={isHere(col.href)}
            className={`${ITEM} ${isHere(col.href) ? ITEM_ACTIVE : ITEM_IDLE}`}
          >
            {col.label}
            {col.note && (
              <span className="text-[0.625rem] normal-case tracking-normal text-muted-foreground">
                {col.note}
              </span>
            )}
          </Link>

          {col.designs.length > 0 && (
            // pt-2 is the bridge: the gap between link and panel belongs to the
            // hovered group, so the pointer can cross it without the panel closing.
            <div className="invisible absolute left-0 top-full z-40 pt-2 opacity-0 transition-[opacity,visibility] duration-(--duration-fast) group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 motion-reduce:transition-none">
              <ul
                className={`rounded-xl border bg-popover p-2 shadow-card ${
                  col.designs.length > PANEL_SPLITS_AT
                    ? "grid w-[26rem] grid-cols-2 gap-x-2"
                    : "min-w-48"
                }`}
              >
                <li className={col.designs.length > PANEL_SPLITS_AT ? "col-span-2" : undefined}>
                  <Link
                    href={col.href}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors duration-(--duration-fast) hover:bg-secondary"
                  >
                    All {col.label}
                  </Link>
                </li>
                {col.designs.map((d) => (
                  <li key={d.href}>
                    <Link
                      href={d.href}
                      className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:bg-secondary hover:text-foreground"
                    >
                      {d.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}

      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          data-active={isHere(l.href)}
          className={`${ITEM} ${isHere(l.href) ? ITEM_ACTIVE : ITEM_IDLE}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

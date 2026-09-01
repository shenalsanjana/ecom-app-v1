"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { NavigationMenu } from "@base-ui/react/navigation-menu";
import { MIN_MEGA_MENU_COLUMNS, type NavColumn } from "@/app/_lib/taxonomy-nav";

const TRIGGER_CLASS =
  "flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand data-[popup-open]:text-brand";

/** The "Shop" nav item, expanded into a panel of departments.
 *
 *  Takes plain columns rather than DepartmentView rows: this is a Client
 *  Component, and `@/app/_lib/taxonomy` imports Prisma. The header does that
 *  work and passes the result down. The type-only import below is erased.
 *
 *  Links are plain next/link elements rather than NavigationMenu.Link — Base
 *  UI's `render` prop would move the href into props.render, where this repo's
 *  element-tree tests cannot see it. */
export function MegaMenu({ columns }: { columns: NavColumn[] }) {
  if (columns.length < MIN_MEGA_MENU_COLUMNS) {
    return (
      <Link
        href="/categories"
        className="text-xs uppercase tracking-[0.12em] text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand"
      >
        Shop
      </Link>
    );
  }

  return (
    <NavigationMenu.Root>
      <NavigationMenu.List className="flex items-center">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className={TRIGGER_CLASS}>
            Shop
            <NavigationMenu.Icon>
              <ChevronDown className="h-3.5 w-3.5" />
            </NavigationMenu.Icon>
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="w-[min(56rem,90vw)] p-6">
            <ul className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4">
              {columns.map((col) => (
                <li key={col.href}>
                  <Link
                    href={col.href}
                    className="font-heading text-sm font-semibold tracking-tight text-foreground transition-colors duration-(--duration-fast) hover:text-brand"
                  >
                    {col.label}
                  </Link>
                  <ul className="mt-3 space-y-1.5">
                    {col.designs.map((d) => (
                      <li key={d.href}>
                        <Link
                          href={d.href}
                          className="text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand"
                        >
                          {d.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner sideOffset={12} className="z-40">
          <NavigationMenu.Popup className="rounded-xl border bg-background shadow-lg">
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

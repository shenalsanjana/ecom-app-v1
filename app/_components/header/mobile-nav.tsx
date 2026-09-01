// app/_components/header/mobile-nav.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion } from "@base-ui/react/accordion";
import type { NavColumn } from "@/app/_lib/taxonomy-nav-model";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/categories", label: "Shop" },
  { href: "/deals", label: "Deals" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

// Mobile-only menu: the desktop header gates its nav + search behind `md:`,
// leaving small screens with no way to browse or search. This Sheet restores
// both. Hidden on md+ via the trigger's own `md:hidden`.
export function MobileNav({ columns }: { columns: NavColumn[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            className="md:hidden"
          />
        }
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-sm gap-0 p-0">
        <SheetTitle className="px-5 pb-1 pt-5 text-lg font-semibold">
          Menu
        </SheetTitle>
        <form action="/search" className="relative px-5 pt-3">
          <Search className="pointer-events-none absolute left-8 top-[calc(50%+0.375rem)] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            placeholder="Search products..."
            className="pl-9"
          />
        </form>
        <div className="px-5">
          <TaxonomySection columns={columns} onNavigate={() => setOpen(false)} />
        </div>
        <nav className="flex flex-col px-2 py-2">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/** The taxonomy list inside the mobile sheet. Exported and stateless so it can
 *  be tested by calling it: MobileNav itself holds `useState`, which cannot run
 *  in the node test environment. `onNavigate` closes the sheet on a tap.
 *
 *  Unlike the desktop trigger there is no minimum-column gate: one collapsible
 *  row is an ordinary list item, and this is the only place the taxonomy
 *  reaches phones. */
export function TaxonomySection({
  columns,
  onNavigate,
}: {
  columns: NavColumn[];
  onNavigate: () => void;
}) {
  if (columns.length === 0) return null;
  return (
    <Accordion.Root className="mb-4 border-b pb-4">
      {columns.map((col) => (
        <Accordion.Item key={col.href} className="border-b last:border-b-0">
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between py-3 text-sm font-medium">
              {col.label}
              <ChevronDown className="h-4 w-4 transition-transform data-[panel-open]:rotate-180" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className="pb-3">
            <ul className="space-y-1 pl-3">
              <li>
                <Link
                  href={col.href}
                  onClick={onNavigate}
                  className="block py-1.5 text-sm text-muted-foreground hover:text-brand"
                >
                  All {col.label}
                </Link>
              </li>
              {col.designs.map((d) => (
                <li key={d.href}>
                  <Link
                    href={d.href}
                    onClick={onNavigate}
                    className="block py-1.5 text-sm text-muted-foreground hover:text-brand"
                  >
                    {d.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}

// app/_components/header/mobile-nav.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/categories", label: "Shop" },
  { href: "/deals", label: "Deals" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

// Mobile-only menu: the desktop header gates its nav + search behind `md:`,
// leaving small screens with no way to browse or search. This Sheet restores
// both. Hidden on md+ via the trigger's own `md:hidden`.
export function MobileNav() {
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
        <nav className="mt-2 flex flex-col px-2 py-2">
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

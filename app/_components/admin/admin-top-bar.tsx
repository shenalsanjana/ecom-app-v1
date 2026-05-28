"use client";
// Admin top bar: brand link (→ /admin), mobile hamburger that opens a
// Sheet with the same ADMIN_NAV items, and a user dropdown with
// "Back to store" + "Sign out".
//
// Note: this project's UI primitives wrap @base-ui/react (not Radix UI).
// The slot-composition pattern is `render={<Element />}` (not `asChild`).
// Sign-out uses onClick (not onSelect) — matching profile-menu.tsx.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ADMIN_NAV, isActive } from "./admin-sidebar";

export function AdminTopBar({ userLabel }: { userLabel: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 h-14 border-b bg-background flex items-center px-4 sm:px-6">
      <Sheet>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden mr-2"
              aria-label="Open menu"
            />
          }
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64">
          <nav className="mt-6 flex flex-col gap-1 text-sm">
            {ADMIN_NAV.map((it) => {
              const active = isActive(it.href, pathname);
              return (
                <SheetClose
                  key={it.href}
                  render={
                    <Link
                      href={it.href}
                      className={
                        active
                          ? "rounded px-3 py-2 bg-secondary font-medium text-foreground"
                          : "rounded px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }
                    />
                  }
                >
                  {it.label}
                </SheetClose>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <Link href="/admin" className="font-semibold tracking-tight">
        Dressing Bear · Admin
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="ml-auto text-sm font-normal text-muted-foreground"
            />
          }
        >
          {userLabel}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href="/" />}>
            Back to store
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              handleSignOut();
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

"use client";
// Desktop-only sidebar (hidden below md). ADMIN_NAV and isActive are
// exported so admin-top-bar.tsx can render the same items inside its
// mobile drawer.
import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === "/admin") return pathname === "/admin";
  return pathname === itemHref || pathname.startsWith(itemHref + "/");
}

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:block w-56 shrink-0 border-r border-sidebar-border bg-sidebar">
      <nav className="flex flex-col gap-1 p-4 text-sm">
        {ADMIN_NAV.map((it) => {
          const active = isActive(it.href, pathname);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={
                active
                  ? "rounded px-2 py-1.5 bg-secondary font-medium text-foreground"
                  : "rounded px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

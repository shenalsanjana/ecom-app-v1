// app/_components/account/account-sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/(auth)/actions";

const ITEMS = [
  { href: "/account", label: "Profile" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/security", label: "Security" },
];

export function AccountSidebar({ userName }: { userName: string }) {
  const path = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r pr-6">
      <div className="mb-6">
        <div className="text-xs text-muted-foreground">Signed in as</div>
        <div className="truncate font-medium">{userName}</div>
      </div>
      <nav className="flex flex-col gap-1 text-sm">
        {ITEMS.map((it) => {
          const active = path === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={
                active
                  ? "rounded px-2 py-1.5 bg-secondary font-medium"
                  : "rounded px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
      <form action={logoutAction} className="mt-6">
        <button
          type="submit"
          className="w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Log out
        </button>
      </form>
    </aside>
  );
}

// app/_components/account/account-sidebar.tsx
"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

const ITEMS = [
  { href: "/account", label: "Profile" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/security", label: "Security" },
];

export function AccountSidebar({ userName }: { userName: string }) {
  const path = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await signOut({ redirect: false });
      router.push("/");
      router.refresh();
    });
  }

  return (
    <aside className="w-full shrink-0 border-b pb-6 md:w-56 md:border-b-0 md:border-r md:pb-0 md:pr-6">
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
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className="mt-6 w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
      >
        {isPending ? "Logging out…" : "Log out"}
      </button>
    </aside>
  );
}

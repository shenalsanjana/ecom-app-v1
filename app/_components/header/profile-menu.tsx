// app/_components/header/profile-menu.tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { firstName } from "@/app/_lib/format";

export function ProfileMenu() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const user =
    status === "authenticated" && session?.user
      ? {
          name: session.user.name ?? "",
          email: session.user.email ?? "",
          isAdmin: session.user.role === "ADMIN",
        }
      : null;

  function handleLogout() {
    setOpen(false);
    startTransition(async () => {
      // Client-side signOut clears the cookie via /api/auth/signout AND
      // calls _getSession({event:"storage"}) internally, which (unlike
      // SessionProvider's update()) does setSession(null) on a null result.
      await signOut({ redirect: false });
      router.push("/");
      router.refresh();
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={user ? `Signed in as ${user.name}` : "Account"}
          />
        }
      >
        <User className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {user ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="text-xs text-muted-foreground">Hi,</div>
                <div className="truncate">{firstName(user.name)}</div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/account" />}>
              My account
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/account/orders" />}>
              My orders
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/account/addresses" />}>
              Saved addresses
            </DropdownMenuItem>
            {user.isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/admin" />}>
                  Admin panel
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                handleLogout();
              }}
              disabled={isPending}
            >
              {isPending ? "Logging out…" : "Log out"}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem render={<Link href="/login" />}>
              Log in
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/signup" />}>
              Sign up
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

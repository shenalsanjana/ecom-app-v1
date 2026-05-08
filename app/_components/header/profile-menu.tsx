// app/_components/header/profile-menu.tsx
"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { useSession } from "next-auth/react";
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
import { logoutAction } from "@/app/(auth)/actions";

export function ProfileMenu() {
  const { data: session, status } = useSession();
  const user =
    status === "authenticated" && session?.user
      ? { name: session.user.name ?? "", email: session.user.email ?? "" }
      : null;

  return (
    <DropdownMenu>
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
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<form action={logoutAction} />}>
              <button type="submit" className="w-full text-left">
                Log out
              </button>
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

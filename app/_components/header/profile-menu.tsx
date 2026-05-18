// app/_components/header/profile-menu.tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const user =
    status === "authenticated" && session?.user
      ? { name: session.user.name ?? "", email: session.user.email ?? "" }
      : null;

  function handleLogout() {
    setOpen(false);
    startTransition(async () => {
      await logoutAction();
      await update();
      router.refresh();
      router.push("/");
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

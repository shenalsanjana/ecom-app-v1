// app/_components/header/cart-icon.tsx
"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCart } from "@/app/_lib/cart-context";

export function CartIcon() {
  const { totalItems } = useCart();

  return (
    <Link href="/cart" aria-label="View cart">
      <Button variant="ghost" size="icon" className="relative" aria-label="Cart">
        <ShoppingCart className="h-5 w-5" />
        {totalItems > 0 ? (
          <Badge className="absolute -right-1 -top-1 h-5 min-w-[1.25rem] rounded-full px-1 text-[10px]">
            {totalItems}
          </Badge>
        ) : null}
      </Button>
    </Link>
  );
}

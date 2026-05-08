// app/_components/header/wishlist-icon.tsx
"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/app/_lib/wishlist-context";

export function WishlistIcon() {
  const { ids } = useWishlist();
  const count = ids.size;
  return (
    <Link href="/wishlist" aria-label="Wishlist">
      <Button variant="ghost" size="icon-lg" className="relative" aria-label="Wishlist">
        <Heart className="h-5 w-5" />
        {count > 0 ? (
          <Badge
            variant="brand"
            className="absolute -right-1 -top-1 h-5 min-w-[1.25rem] rounded-full px-1 text-[10px]"
          >
            {count}
          </Badge>
        ) : null}
      </Button>
    </Link>
  );
}

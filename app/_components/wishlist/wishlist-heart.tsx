"use client";

import { Heart } from "lucide-react";
import { useWishlist } from "@/app/_lib/wishlist-context";

type Props = {
  productId: string;
  fromPath?: string;
};

export function WishlistHeart({ productId, fromPath = "/" }: Props) {
  const { has, toggle } = useWishlist();
  const filled = has(productId);

  return (
    <button
      type="button"
      onClick={() => toggle(productId, fromPath)}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-transform duration-(--duration-fast) motion-safe:hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={filled ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={filled}
    >
      <Heart
        key={filled ? "filled" : "empty"}
        className={
          filled
            ? "h-4 w-4 fill-brand text-brand motion-safe:animate-wishlist-fill"
            : "h-4 w-4 text-muted-foreground"
        }
      />
    </button>
  );
}

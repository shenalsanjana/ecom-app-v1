// app/_components/header/wishlist-icon.tsx
import Link from "next/link";
import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = { loggedIn: boolean; count: number };

export function WishlistIcon({ loggedIn, count }: Props) {
  const href = loggedIn ? "/wishlist" : "/login?callbackUrl=/wishlist";
  const label = loggedIn ? "Wishlist" : "Sign in to view wishlist";
  return (
    <Link href={href} aria-label={label}>
      <Button variant="ghost" size="icon-lg" className="relative" aria-label={label}>
        <Heart className="h-5 w-5" />
        {loggedIn && count > 0 ? (
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

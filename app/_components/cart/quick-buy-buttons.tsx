// app/_components/cart/quick-buy-buttons.tsx
"use client";

import Link from "next/link";
import { ShoppingCart, Zap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

type Props = {
  productId: string;
};

// Products in this catalogue all have sizes, so a one-click "add to cart"
// from the thumbnail would always skip required size selection. Both buttons
// route to the product detail page where size + quantity are chosen.
export function QuickBuyButtons({ productId }: Props) {
  const href = `/products/${productId}`;
  return (
    <div className="flex w-full gap-2">
      <Link
        href={href}
        className={buttonVariants({
          size: "sm",
          variant: "outline",
          className: "flex-1",
        })}
        aria-label="Add to cart"
      >
        <ShoppingCart className="mr-2 h-4 w-4" />
        Add to cart
      </Link>
      <Link
        href={`${href}?action=buy-now`}
        className={buttonVariants({
          size: "sm",
          className: "flex-1 bg-black hover:bg-black/90 text-white",
        })}
        aria-label="Buy now"
      >
        <Zap className="mr-2 h-4 w-4" />
        Buy now
      </Link>
    </div>
  );
}

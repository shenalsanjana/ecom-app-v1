// app/_components/cart/quick-buy-buttons.tsx
"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { AddToCartDialog } from "@/app/_components/cart/add-to-cart-dialog";

type Props = {
  productId: string;
  name: string;
  price: number;
  image: string;
  sizes: string;
};

// "Add to cart" opens an inline size-picker dialog (no nav). "Buy now" still
// routes to the PDP so the customer sees full product context (gallery,
// description, related items) before committing — the PDP handles the
// ?action=buy-now scroll/highlight.
export function QuickBuyButtons({ productId, name, price, image, sizes }: Props) {
  const href = `/products/${productId}`;
  return (
    <div className="flex w-full gap-2">
      <AddToCartDialog
        productId={productId}
        name={name}
        price={price}
        image={image}
        sizes={sizes}
      />
      <Link
        href={`${href}?action=buy-now`}
        className={buttonVariants({
          size: "sm",
          variant: "default",
          className: "flex-1 min-w-0 whitespace-nowrap",
        })}
        aria-label="Buy now"
      >
        <Zap className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Buy now</span>
      </Link>
    </div>
  );
}

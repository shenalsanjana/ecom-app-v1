// app/_components/cart/cart-item.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/app/_lib/cart-context";
import type { CartItem } from "@/app/_lib/cart-context";

function formatPrice(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type Props = {
  item: CartItem;
};

export function CartItemRow({ item }: Props) {
  const { updateQuantity, removeItem } = useCart();
  const subtotal = item.price * item.quantity;

  return (
    <div className="flex gap-4 py-4 border-b">
      <Link
        href={`/products/${item.productId}`}
        className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800"
      >
        <Image
          src={item.image}
          alt={item.name}
          fill
          sizes="96px"
          className="object-cover"
        />
      </Link>

      <div className="flex flex-1 flex-col justify-between">
        <div className="flex justify-between gap-2">
          <Link
            href={`/products/${item.productId}`}
            className="line-clamp-2 text-sm font-medium hover:underline"
          >
            {item.name}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeItem(item.productId)}
            aria-label="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => updateQuantity(item.productId, item.quantity - 1)}
              aria-label="Decrease quantity"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => updateQuantity(item.productId, item.quantity + 1)}
              disabled={item.quantity >= 10}
              aria-label="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <div className="text-sm font-medium">
            {formatPrice(subtotal)}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          {formatPrice(item.price)} each
        </div>
      </div>
    </div>
  );
}
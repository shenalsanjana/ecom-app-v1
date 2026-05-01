// app/_components/cart/add-to-cart-card-button.tsx
"use client";

import { useCart } from "@/app/_lib/cart-context";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { useState } from "react";

type Props = {
  productId: string;
  name: string;
  price: number;
  image: string;
};

export function AddToCartCardButton({ productId, name, price, image }: Props) {
  const { addItem, items } = useCart();
  const [added, setAdded] = useState(false);

  const existing = items.find((i) => i.productId === productId);
  const inCart = existing ? existing.quantity : 0;

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    addItem({ productId, name, price, image });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <Button
      className="w-full"
      size="sm"
      onClick={handleAdd}
      disabled={added}
      variant={added ? "outline" : "default"}
    >
      <ShoppingCart className="mr-2 h-4 w-4" />
      {added ? "Added!" : "Add to cart"}
    </Button>
  );
}
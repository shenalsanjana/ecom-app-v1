// app/_components/cart/add-to-cart-button.tsx
"use client";

import { useCart } from "@/app/_lib/cart-context";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  productId: string;
  name: string;
  price: number;
  image: string;
  disabled?: boolean;
  className?: string;
};

export function AddToCartButton({
  productId, name, price, image, disabled, className,
}: Props) {
  const { addItem, items } = useCart();
  const router = useRouter();
  const [added, setAdded] = useState(false);

  const existing = items.find((i) => i.productId === productId);
  const inCart = existing ? existing.quantity : 0;

  function handleAdd() {
    addItem({ productId, name, price, image });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  if (inCart > 0) {
    return (
      <Button
        className={className}
        variant="outline"
        onClick={() => router.push("/cart")}
      >
        View cart ({inCart})
      </Button>
    );
  }

  return (
    <Button
      className={className}
      onClick={handleAdd}
      disabled={disabled || added}
    >
      {added ? "Added!" : "Add to cart"}
    </Button>
  );
}

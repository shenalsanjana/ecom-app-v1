// app/_components/cart/add-to-cart-button.tsx
"use client";

import { useCart } from "@/app/_lib/cart-context";
import { trackAddToCart } from "@/app/_lib/meta-pixel";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  productId: string;
  variantId: string;
  color?: string | null;
  name: string;
  price: number;
  image: string;
  size?: string | null;
  quantity?: number;
  /** When true, the button blocks the click until a size is selected. */
  requiresSize?: boolean;
  disabled?: boolean;
  className?: string;
};

export function AddToCartButton({
  productId,
  variantId,
  color = null,
  name,
  price,
  image,
  size = null,
  quantity = 1,
  requiresSize = false,
  disabled,
  className,
}: Props) {
  const { addItem, items } = useCart();
  const router = useRouter();
  const [added, setAdded] = useState(false);

  const cartKey = size ? `${variantId}::${size}` : variantId;
  const existing = items.find((i) => i.key === cartKey);
  const inCart = existing ? existing.quantity : 0;

  const sizeMissing = requiresSize && !size;
  const buttonDisabled = disabled || added || sizeMissing;

  function handleAdd() {
    if (sizeMissing) return;
    addItem({ productId, variantId, color, name, price, image, size }, quantity);
    trackAddToCart(productId, price * quantity, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  if (inCart > 0 && !sizeMissing) {
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
      disabled={buttonDisabled}
    >
      {added ? "Added!" : "Add to cart"}
    </Button>
  );
}

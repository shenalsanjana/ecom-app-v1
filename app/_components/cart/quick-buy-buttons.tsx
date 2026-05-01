// app/_components/cart/quick-buy-buttons.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCart } from "@/app/_lib/cart-context";
import { Button } from "@/components/ui/button";

type Props = {
  productId: string;
  name: string;
  price: number;
  image: string;
};

export function QuickBuyButtons({ productId, name, price, image }: Props) {
  const router = useRouter();
  const { addItem } = useCart();

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    addItem({ productId, name, price, image });
  }

  function handleBuyNow(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    addItem({ productId, name, price, image });
    router.push("/cart");
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={handleAddToCart}
        className="flex-1"
      >
        Add to cart
      </Button>
      <Button
        size="sm"
        onClick={handleBuyNow}
        className="flex-1 bg-black hover:bg-black/90 text-white"
      >
        Buy now
      </Button>
    </div>
  );
}
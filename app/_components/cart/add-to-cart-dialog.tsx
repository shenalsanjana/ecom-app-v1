"use client";

import { useState } from "react";
import { ShoppingCart, Check } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCart } from "@/app/_lib/cart-context";
import { formatPrice } from "@/app/_lib/format";

type Props = {
  productId: string;
  name: string;
  price: number;
  image: string;
  sizes: string;
  triggerVariant?: "outline" | "default";
  triggerClassName?: string;
};

export function AddToCartDialog({
  productId,
  name,
  price,
  image,
  sizes,
  triggerVariant = "outline",
  triggerClassName = "flex-1 min-w-0 whitespace-nowrap",
}: Props) {
  const sizeList = sizes ? sizes.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const { addItem } = useCart();
  const [open, setOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [added, setAdded] = useState(false);

  const requiresSize = sizeList.length > 0;
  const canAdd = !requiresSize || selectedSize !== "";

  function handleAdd() {
    if (!canAdd) return;
    addItem(
      { productId, name, price, image, size: selectedSize || null },
      1,
    );
    setAdded(true);
    // Auto-close after a brief success flash so the customer sees confirmation
    // without a second click. Reset state for the next open.
    setTimeout(() => {
      setOpen(false);
      setSelectedSize("");
      setAdded(false);
    }, 900);
  }

  // If the user opens, picks a size, then closes without adding, reset state
  // so reopening starts clean.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSelectedSize("");
      setAdded(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={buttonVariants({
          size: "sm",
          variant: triggerVariant,
          className: triggerClassName,
        })}
        aria-label="Add to cart"
      >
        <ShoppingCart className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Add to cart</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            {formatPrice(price)}
            {requiresSize ? " — choose your size" : ""}
          </DialogDescription>
        </DialogHeader>
        {requiresSize && (
          <div className="flex flex-wrap gap-2">
            {sizeList.map((size) => {
              const selected = selectedSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedSize(size)}
                  data-state={selected ? "selected" : "unselected"}
                  aria-pressed={selected}
                  className={`min-w-[48px] rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-(--duration-fast) ease-(--ease-out) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    selected
                      ? "border-foreground bg-foreground text-background ring-2 ring-ring ring-offset-2"
                      : "border-border hover:border-foreground/40"
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        )}
        <DialogFooter className="mt-2">
          <DialogClose
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </DialogClose>
          <Button onClick={handleAdd} disabled={!canAdd || added}>
            {added ? (
              <>
                <Check className="mr-1.5 h-4 w-4" aria-hidden />
                Added
              </>
            ) : (
              "Add to cart"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

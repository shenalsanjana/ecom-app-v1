// app/_components/cart/cart-page-client.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { CartItemRow } from "@/app/_components/cart/cart-item";
import { CartSummary } from "@/app/_components/cart/cart-summary";
import { useCart } from "@/app/_lib/cart-context";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
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

export function CartPageClient() {
  const { items, clearCart } = useCart();
  const [clearOpen, setClearOpen] = useState(false);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-8 font-heading text-2xl font-semibold tracking-tight">Shopping Cart</h1>

      {items.length === 0 ? (
        <div className="rounded border p-10 text-center">
          <ShoppingCart className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-medium">Your cart is empty</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Looks like you have not added any items to your cart yet.
          </p>
          <Link href="/" className={buttonVariants({ className: "mt-4" })}>
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-lg border">
              <div className="flex justify-between border-b px-4 py-3 text-sm font-medium text-muted-foreground">
                <span>Product</span>
                <span>Quantity</span>
              </div>
              <div className="px-4">
                {items.map((item) => (
                  <CartItemRow key={item.key} item={item} />
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-between">
              <Link href="/" className={buttonVariants({ variant: "outline" })}>
                Continue shopping
              </Link>
              <Dialog open={clearOpen} onOpenChange={setClearOpen}>
                <DialogTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                    />
                  }
                >
                  Clear cart
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Clear your cart?</DialogTitle>
                    <DialogDescription>
                      This removes all items from your cart. You can&apos;t undo this.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                      Keep items
                    </DialogClose>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        clearCart();
                        setClearOpen(false);
                      }}
                    >
                      Clear cart
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div>
            <CartSummary />
          </div>
        </div>
      )}
    </div>
  );
}

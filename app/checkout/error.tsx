"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[checkout]", error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Checkout couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your cart is safe. You can try again, or head back and review it.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset} variant="default">
          Try again
        </Button>
        <Link
          href="/cart"
          className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
        >
          Back to cart
        </Link>
      </div>
    </main>
  );
}

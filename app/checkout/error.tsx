"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

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
      <h1 className="font-heading text-3xl font-medium">Checkout couldn&apos;t load</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Your cart is safe. You can try again, or head back and review it.
      </p>
      {process.env.NODE_ENV !== "production" && (
        <pre
          data-debug-error
          className="mt-4 w-full overflow-auto rounded bg-red-50 p-3 text-left text-xs text-red-900"
        >
          {error.message}
          {error.stack ? `\n\n${error.stack}` : ""}
        </pre>
      )}
      <div className="mt-6 flex gap-3">
        <Button onClick={reset} variant="brand" size="lg">
          Try again
        </Button>
        <Link href="/cart" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Back to cart
        </Link>
      </div>
    </main>
  );
}

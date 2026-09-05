"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[search]", error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="font-heading text-3xl font-semibold">Search hit a snag</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Try the search again, or browse the catalog instead.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset} variant="brand" size="lg">
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Browse categories
        </Link>
      </div>
    </main>
  );
}

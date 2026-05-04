"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[account]", error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn&apos;t load your account just now.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset} variant="default">
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}

"use client";
// Error boundary for the dashboard. Catches throws from getDashboardKpis()
// or any rendering issue. Shows a generic message (no internal details),
// logs the actual error to the console for ops.
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Admin Dashboard Error]:", error);
  }, [error]);

  return (
    <div className="rounded-lg border p-8 text-center">
      <h2 className="text-lg font-semibold">Couldn&apos;t load the dashboard</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Something went wrong fetching the latest counts. Try again, or check the console for details.
      </p>
      <Button onClick={reset} className="mt-4">Retry</Button>
    </div>
  );
}

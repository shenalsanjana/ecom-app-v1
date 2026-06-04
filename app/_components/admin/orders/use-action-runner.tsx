"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type ActionResult = { success: boolean; warning?: string; error?: string };

/**
 * Shared runner for admin order actions: optional confirm gate, pending state,
 * a sonner toast on success/error, and a router.refresh() so server-rendered
 * rows and chip counts update without a manual page reload. `runningLabel` lets
 * a caller show a spinner on the specific button that is currently running.
 */
export function useActionRunner() {
  const [pending, start] = useTransition();
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const router = useRouter();

  const run = (label: string, fn: () => Promise<ActionResult>, confirmMsg?: string) =>
    start(async () => {
      if (confirmMsg && !window.confirm(confirmMsg)) return;
      setRunningLabel(label);
      try {
        const r = await fn();
        if (r.success) toast.success(r.warning ?? "Done");
        else toast.error(r.error ?? "Action failed");
        router.refresh();
      } finally {
        setRunningLabel(null);
      }
    });

  return { pending, runningLabel, run };
}

export function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px]"
      aria-hidden
    />
  );
}

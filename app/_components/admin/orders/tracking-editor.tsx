"use client";
import { useState } from "react";
import { dispatchManually, updateTrackingNumber } from "@/app/admin/orders/actions";
import { useActionRunner, Spinner } from "./use-action-runner";

type Props = {
  orderId: string;
  mode: "dispatch" | "edit";
  trackingCode: string | null;
};

export function TrackingEditor({ orderId, mode, trackingCode }: Props) {
  const { pending, runningLabel, run } = useActionRunner();
  const [value, setValue] = useState(trackingCode ?? "");

  const submit = () => {
    const tracking = value.trim();
    if (!tracking) return;
    if (mode === "dispatch") {
      run("track", () => dispatchManually(orderId, tracking),
        "Mark this order dispatched and email the customer the tracking number?");
    } else {
      run("track", () => updateTrackingNumber(orderId, tracking));
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={`tracking-${orderId}`}>
        {mode === "dispatch" ? "Royal Express tracking number" : "Update tracking number"}
      </label>
      <input
        id={`tracking-${orderId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. RA03870247"
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <button
        disabled={pending || !value.trim()}
        onClick={submit}
        className="flex w-full items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {runningLabel === "track" && <Spinner />}
        {mode === "dispatch" ? "📦 Mark dispatched (Royal Express)" : "Save tracking number"}
      </button>
    </div>
  );
}

"use client";

import { useId } from "react";
import { type PosAdjustmentDraft } from "@/app/_lib/pos-adjustments";

export function PosAdjustmentFields({ label, value, locked, onChange }: {
  label: string; value: PosAdjustmentDraft; locked: boolean; onChange: (value: PosAdjustmentDraft) => void;
}) {
  const id = useId();
  return <fieldset disabled={locked} className="min-w-0 space-y-3">
    <legend className="sr-only">{label} adjustments</legend>
    {(["charge", "discount"] as const).map(kind => {
      const title = kind === "charge" ? "Additional cost" : "Discount";
      return <div key={kind} className="space-y-1">
        <label className="text-xs" htmlFor={`${id}-${kind}`}>{title}</label>
        <div className="flex gap-2">
          <input id={`${id}-${kind}`} aria-label={`${title} for ${label}`} type="number" min="0" step="0.01"
            max={value[kind].mode === "PERCENT" ? (kind === "discount" ? 100 : 1000) : 10_000_000}
            inputMode="decimal" placeholder="0" value={value[kind].value}
            onChange={event => onChange({ ...value, [kind]: { ...value[kind], value: event.target.value } })}
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 text-sm disabled:opacity-60" />
          <select aria-label={`${title} type for ${label}`} value={value[kind].mode}
            onChange={event => onChange({ ...value, [kind]: { ...value[kind], mode: event.target.value as "FIXED" | "PERCENT" } })}
            className="w-20 shrink-0 rounded-md border bg-background px-2 py-2 text-sm">
            <option value="FIXED">LKR</option><option value="PERCENT">%</option>
          </select>
        </div>
      </div>;
    })}
    <p className="text-xs text-muted-foreground">Additional cost first, then discount. Up to two decimal places.</p>
  </fieldset>;
}

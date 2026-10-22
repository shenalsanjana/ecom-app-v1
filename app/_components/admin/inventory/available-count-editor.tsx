"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useStockOperation } from "./use-stock-operation";
import { useRouter } from "next/navigation";

type Result = { success: true } | { success: false; error: string };

export function AvailableCountEditor({ quantity, version, label, disabled, lowStockThreshold, onSave }: {
  quantity: number; version: number; label: string; disabled?: boolean; lowStockThreshold: number;
  onSave: (quantity: number, expectedVersion: number, intent: { reason: string; operationKey: string }) => Promise<Result>;
}) {
  const router = useRouter();
  const operation = useStockOperation();
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  // Keep the version displayed when editing began, even after a sale refresh.
  const [edit, setEdit] = useState<{ value: string; version: number; original: number } | null>(null);
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit || pending || disabled) return;
    const next = Number(edit.value);
    if (!edit.value.trim() || !Number.isInteger(next) || next < 0 || next > 2_147_483_647) {
      setError("Enter a whole available count of zero or more."); return;
    }
    if (next === edit.original) { setEdit(null); setError(""); return; }
    if (reason.trim().length < 3) { setError("Enter a reason for this adjustment."); return; }
    const expectedVersion = edit.version;
    setError("");
    start(async () => {
      try {
        const result = await onSave(next, expectedVersion, { reason: reason.trim(), operationKey: operation.keyFor({ next, expectedVersion, reason: reason.trim() }) });
        if (result.success) { operation.complete(); setReason(""); setEdit(null); } else setError(result.error);
      } catch { setError("Could not save this count. Please try again."); }
      finally { router.refresh(); }
    });
  }
  if (!edit) return <div className="flex flex-wrap items-center gap-2">
    <strong className={quantity === 0 ? "text-destructive" : quantity <= lowStockThreshold ? "text-amber-700" : ""}>{quantity}</strong>
    <button type="button" disabled={disabled || pending} aria-label={`Adjust available count for ${label}`}
      onClick={() => { operation.complete(); setReason(""); setEdit({ value: String(quantity), version, original: quantity }); setError(""); }}
      className="rounded-md border px-2 py-1 text-xs disabled:opacity-50">Adjust</button>
  </div>;
  return <form onSubmit={submit} className="min-w-48 space-y-2">
    <label className="block text-xs text-muted-foreground">Available count for {label}
      <input type="number" required min={0} max={2147483647} step={1} value={edit.value} disabled={disabled || pending}
        onChange={event => setEdit({ ...edit, value: event.target.value })}
        className="mt-1 block w-24 rounded border bg-background px-2 py-1 text-sm" />
    </label>
    <label className="block text-xs text-muted-foreground">Reason for adjustment
      <input value={reason} required minLength={3} maxLength={250} onChange={event => setReason(event.target.value)} placeholder="e.g. Count correction or damaged stock" className="mt-1 block w-full rounded border bg-background px-2 py-1.5 text-sm" />
    </label>
    <p className="max-w-xs text-xs text-muted-foreground">Excludes units allocated to orders. Saving replaces the available count.</p>
    <div className="flex gap-2"><button disabled={disabled || pending} className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">{pending ? "Saving…" : "Save count"}</button>
      <button type="button" disabled={pending} onClick={() => { setEdit(null); setError(""); }} className="rounded-md border px-2 py-1 text-xs">Cancel</button></div>
    {error && <p role="alert" className="max-w-xs text-xs text-destructive">{error}</p>}
  </form>;
}

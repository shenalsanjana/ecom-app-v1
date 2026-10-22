"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignStockParent } from "@/app/admin/inventory/structure-actions";

export function UnassignedStock({ rows, parents }: {
  rows: { id: string; color: string; size: string; quantity: number; version: number; stockGroup: string }[];
  parents: { id: string; name: string; stockGroup: string }[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return <div className="space-y-3">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {rows.map(row => <form key={row.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3" onSubmit={event => {
      event.preventDefault(); if (pending) return;
      const inventoryProductId = String(new FormData(event.currentTarget).get("parentId") ?? "");
      start(async () => {
        const result = await assignStockParent({ id: row.id, inventoryProductId, expectedVersion: row.version });
        if (!result.success) setError(result.error); else setError("");
        router.refresh();
      });
    }}>
      <span className="mr-auto text-sm">{row.color} · {row.size} · <strong>{row.quantity} units</strong></span>
      <select name="parentId" required disabled={pending} defaultValue="" aria-label={`Physical product for ${row.color} ${row.size}`} className="max-w-full rounded border bg-background px-2 py-1.5 text-sm">
        <option value="" disabled>Select physical product…</option>
        {parents.filter(parent => parent.stockGroup === row.stockGroup).map(parent => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
      </select>
      <button disabled={pending} className="rounded-md border px-3 py-1.5 text-sm">Assign without changing quantity</button>
    </form>)}
  </div>;
}

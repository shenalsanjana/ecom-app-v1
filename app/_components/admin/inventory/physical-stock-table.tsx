"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createInventoryStock, restockInventoryStock } from "@/app/admin/inventory/structure-actions";
import { upsertPlainTshirtStock, deletePlainTshirtStock } from "@/app/admin/inventory/actions";
import { useStockOperation } from "./use-stock-operation";
import { AvailableCountEditor } from "./available-count-editor";

type Row = { id: string; color: string; colorSlug: string; size: string; quantity: number; version: number };

export function PhysicalStockTable({ inventoryProductId, rows, lowStockThreshold }: {
  inventoryProductId: string; rows: Row[]; lowStockThreshold: number;
}) {
  const router = useRouter();
  const operation = useStockOperation();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"new" | "restock" | null>(null);
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const quantity = Number(data.get("quantity"));
    const operationKey = operation.keyFor({ mode, inventoryProductId, fields: [...data.entries()] });
    setError("");
    start(async () => {
      const result = mode === "restock" ? await restockInventoryStock({ id: String(data.get("id") ?? ""), quantity, operationKey }) :
        await createInventoryStock({ inventoryProductId, color: String(data.get("color") ?? ""), size: String(data.get("size") ?? ""), quantity, operationKey });
      if (!result.success) { setError(result.error); return; }
      operation.complete(); form.reset(); setMode(null); router.refresh();
    });
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <h4 className="mr-auto text-sm font-semibold">Shared blank stock</h4>
      <button type="button" disabled={pending} onClick={() => { setMode(mode === "new" ? null : "new"); setError(""); }} className="rounded-md border px-3 py-1.5 text-sm">+ Add colour / size</button>
      <button type="button" disabled={pending || rows.length === 0} onClick={() => { setMode(mode === "restock" ? null : "restock"); setError(""); }} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">Receive stock</button>
    </div>
    <p className="text-xs text-muted-foreground">One available balance per physical blank, shared by every linked design. Receive stock adds units. Adjust replaces the available count after you explicitly save; it excludes stock allocated to orders.</p>
    {mode && <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-md border bg-secondary/20 p-3">
      {mode === "new" ? <>
        <label className="space-y-1 text-sm"><span className="block">Colour / Item</span><input name="color" required maxLength={120} disabled={pending} className="rounded border bg-background px-2 py-1.5" /></label>
        <label className="space-y-1 text-sm"><span className="block">Size / Dimensions</span><input name="size" required maxLength={80} disabled={pending} className="w-40 rounded border bg-background px-2 py-1.5" /></label>
      </> : <label className="space-y-1 text-sm"><span className="block">Existing blank</span><select name="id" required disabled={pending} className="rounded border bg-background px-2 py-1.5">
        {rows.map(row => <option key={row.id} value={row.id}>{row.color} · {row.size} (current: {row.quantity})</option>)}
      </select></label>}
      <label className="space-y-1 text-sm"><span className="block">{mode === "restock" ? "Quantity to add" : "Opening available quantity"}</span><input key={mode} name="quantity" type="number" required min={mode === "restock" ? 1 : 0} max={2147483647} step={1} defaultValue={mode === "restock" ? 1 : 0} disabled={pending} className="w-28 rounded border bg-background px-2 py-1.5" /></label>
      <button disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">{pending ? "Saving…" : mode === "restock" ? "Add units" : "Create blank"}</button>
      <button type="button" disabled={pending} onClick={() => setMode(null)} className="px-2 py-1.5 text-sm">Cancel</button>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {rows.length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No blanks configured for this physical product yet.</p> : <div className="overflow-x-auto rounded-md border"><table className="w-full text-left text-sm">
      <caption className="sr-only">Physical blank balances, counted once across linked designs</caption>
      <thead className="border-b bg-secondary/30"><tr><th scope="col" className="p-3">Colour / Item</th><th scope="col" className="p-3">Size / Dimensions</th><th scope="col" className="p-3">Available count</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className="border-b last:border-0">
        <td className="p-3">{row.color}</td><td className="p-3">{row.size}</td>
        <td className="p-3"><AvailableCountEditor quantity={row.quantity} version={row.version} label={`${row.color} ${row.size}`} disabled={pending} lowStockThreshold={lowStockThreshold}
          onSave={(quantity, expectedVersion, intent) => upsertPlainTshirtStock({ ...intent, id: row.id, expectedVersion, color: row.color, colorSlug: row.colorSlug, size: row.size, quantity })} /></td>
        <td className="p-3">{row.quantity === 0 ? <span className="text-destructive">Out of stock</span> : row.quantity <= lowStockThreshold ? <span className="text-amber-700">Low stock</span> : "In stock"}</td>
        <td className="p-3"><button type="button" disabled={pending || row.quantity !== 0} className="text-xs text-destructive disabled:opacity-40" onClick={() => {
          if (!confirm(`Delete the empty ${row.color} ${row.size} blank? Linked blanks and stock with order or movement history cannot be deleted.`)) return;
          start(async () => { const result = await deletePlainTshirtStock(row.id); if (!result.success) setError(result.error); router.refresh(); });
        }}>Delete empty blank</button></td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}

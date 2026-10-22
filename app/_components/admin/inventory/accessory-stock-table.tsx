"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createAccessoryStock, restockAccessoryStock, upsertPlainTshirtStock } from "@/app/admin/inventory/actions";
import { AvailableCountEditor } from "./available-count-editor";
import { useStockOperation } from "./use-stock-operation";
import type { AccessoryStockRow } from "@/app/_lib/inventory-groups";

export function AccessoryStockTable({ rows, lowStockThreshold, readOnly = false }: {
  rows: AccessoryStockRow[]; lowStockThreshold: number; readOnly?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const operation = useStockOperation();
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"new" | "restock">("new");
  const [error, setError] = useState("");
  const existingRows = rows.filter(row => row.id);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawQuantity = String(data.get("quantity") ?? "").trim();
    const quantity = Number(rawQuantity);
    if (!rawQuantity || !Number.isSafeInteger(quantity) || quantity < (mode === "restock" ? 1 : 0) || quantity > 2147483647) {
      setError(mode === "restock" ? "Enter a whole quantity of one or more." : "Enter a whole quantity of zero or more.");
      return;
    }
    const operationKey = operation.keyFor({ mode, fields: [...data.entries()] });
    setError("");
    start(async () => {
      const result = mode === "restock" ? await restockAccessoryStock({
        id: String(data.get("id") ?? ""), quantity, operationKey,
      }) : await createAccessoryStock({
        color: String(data.get("color") ?? ""), size: String(data.get("size") ?? ""), quantity, operationKey,
      });
      if (!result.success) { setError(result.error); return; }
      operation.complete(); form.reset();
      setAdding(false);
      router.refresh();
    });
  }


  return (
    <div className="space-y-4">
      {!readOnly && <div className="flex justify-end">
        <button type="button" disabled={pending} aria-expanded={adding} aria-controls="add-accessory-stock"
          onClick={() => { setAdding(!adding); setError(""); }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {adding ? "Cancel" : "+ Add accessory stock"}
        </button>
      </div>}
      {adding && !readOnly && <form id="add-accessory-stock" onSubmit={add} className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add accessory stock</h3>
        <fieldset disabled={pending} className="flex flex-wrap gap-4 text-sm">
          <legend className="sr-only">How to add stock</legend>
          <label className="flex items-center gap-2"><input type="radio" name="mode" value="new" checked={mode === "new"} onChange={() => { setMode("new"); setError(""); }} />New accessory</label>
          <label className="flex items-center gap-2"><input type="radio" name="mode" value="restock" checked={mode === "restock"} disabled={existingRows.length === 0} onChange={() => { setMode("restock"); setError(""); }} />Restock existing</label>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          {mode === "restock" ? <label className="space-y-1 text-sm sm:col-span-2"><span className="block">Accessory</span>
            <select name="id" required disabled={pending} defaultValue="" className="w-full rounded border bg-background px-3 py-2">
              <option value="" disabled>Select an accessory</option>
              {existingRows.map(row => <option key={row.id} value={row.id!}>{row.color} — {row.size} (current: {row.quantity})</option>)}
            </select>
          </label> : <><label className="space-y-1 text-sm"> <span className="block">Item / Colour</span>
            <input name="color" required maxLength={120} placeholder="e.g. Canvas tote — Natural ivory" disabled={pending} className="w-full rounded border bg-background px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm"><span className="block">Size / Dimensions</span>
            <input name="size" required maxLength={80} placeholder="e.g. 12 × 12 inches or One size" disabled={pending} className="w-full rounded border bg-background px-3 py-2" />
          </label></>}
          <label className="space-y-1 text-sm"><span className="block">{mode === "restock" ? "Quantity to add" : "Opening quantity"}</span>
            <input key={mode} name="quantity" type="number" required min={mode === "restock" ? 1 : 0} max={2147483647} step={1} defaultValue={mode === "restock" ? 1 : 0} disabled={pending} className="w-full rounded border bg-background px-3 py-2" />
          </label>
        </div>
        {mode === "restock" && <p className="text-xs text-muted-foreground">This quantity will be added to the current stock balance.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{pending ? "Adding…" : mode === "restock" ? "Add to existing stock" : "Create accessory stock"}</button>
      </form>}
      {rows.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No accessory stock yet. Use “Add accessory stock” to add your first item.</p> : <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">Accessory stock by product, colour and size. Products using the same blank share one quantity.</caption>
        <thead className="border-b bg-secondary/40 text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Products</th>
            <th scope="col" className="px-4 py-3 font-medium">Colour / Item</th>
            <th scope="col" className="px-4 py-3 font-medium">Size / Dimensions</th>
            <th scope="col" className="px-4 py-3 font-medium">Quantity</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const products = [...row.products].sort((a, b) => Number(a.archived) - Number(b.archived));
            const label = `${row.color} ${row.size}`;
            return (
              <tr key={JSON.stringify([row.colorSlug, row.size])} className="border-b last:border-0">
                <td className="min-w-56 px-4 py-3">
                  {products.length === 0 ? <span className="text-muted-foreground">Not linked to a product yet</span> : products.length === 1 ? (
                    <Link href={`/admin/products/${encodeURIComponent(products[0].id)}/edit`} className="underline underline-offset-2">{products[0].name}{products[0].archived ? " (archived)" : ""}</Link>
                  ) : (
                    <details>
                      <summary className="cursor-pointer">{products[0].name} <span className="text-muted-foreground">+ {products.length - 1} more</span></summary>
                      <ul className="mt-2 space-y-1">
                        {products.map(product => <li key={product.id}><Link href={`/admin/products/${encodeURIComponent(product.id)}/edit`} className="underline underline-offset-2">{product.name}{product.archived ? " (archived)" : ""}</Link></li>)}
                      </ul>
                    </details>
                  )}
                </td>
                <td className="px-4 py-3">{row.color}</td>
                <td className="whitespace-nowrap px-4 py-3">{row.size}</td>
                <td className="px-4 py-3">
                  <AvailableCountEditor quantity={row.quantity ?? 0} version={row.version ?? 0} label={label} disabled={pending || readOnly} lowStockThreshold={lowStockThreshold}
                    onSave={(quantity, expectedVersion, intent) => row.id ? upsertPlainTshirtStock({ id: row.id, expectedVersion, color: row.color, colorSlug: row.colorSlug, size: row.size, quantity, ...intent }) : createAccessoryStock({ color: row.color, colorSlug: row.colorSlug, size: row.size, quantity, ...intent })} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {row.quantity === null ? <span className="text-amber-700">Not set</span> :
                    row.quantity === 0 ? <span className="text-destructive">Out of stock</span> :
                      row.quantity <= lowStockThreshold ? <span className="text-amber-700">Low stock</span> :
                        <span className="text-muted-foreground">In stock</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>}
    </div>
  );
}

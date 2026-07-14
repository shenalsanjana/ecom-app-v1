"use client";
import { useState, useTransition } from "react";
import { upsertPlainTshirtStock, deletePlainTshirtStock } from "@/app/admin/inventory/actions";
import { slugify } from "@/app/_lib/product-helpers";

type Row = { id: string; color: string; colorSlug: string; size: string; quantity: number };

export function PlainStockGrid({ rows, lowStockThreshold }: { rows: Row[]; lowStockThreshold: number }) {
  const [pending, start] = useTransition();
  const [newColor, setNewColor] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newQty, setNewQty] = useState("0");

  const byColor = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byColor.get(r.colorSlug) ?? [];
    list.push(r);
    byColor.set(r.colorSlug, list);
  }

  function saveQuantity(row: Row, quantity: number) {
    start(async () => {
      const r = await upsertPlainTshirtStock({ id: row.id, color: row.color, colorSlug: row.colorSlug, size: row.size, quantity });
      if (!r.success) alert(r.error);
    });
  }

  function remove(row: Row) {
    if (!confirm(`Delete ${row.color} ${row.size}? Any product using this color+size will show unavailable.`)) return;
    start(async () => {
      const r = await deletePlainTshirtStock(row.id);
      if (!r.success) alert(r.error);
    });
  }

  function addCell() {
    const color = newColor.trim();
    const size = newSize.trim();
    const quantity = Math.max(0, Math.trunc(Number(newQty) || 0));
    if (!color || !size) return;
    start(async () => {
      const r = await upsertPlainTshirtStock({ color, colorSlug: slugify(color), size, quantity });
      if (!r.success) { alert(r.error); return; }
      setNewColor(""); setNewSize(""); setNewQty("0");
    });
  }

  return (
    <div className="space-y-4">
      {[...byColor.entries()].map(([colorSlug, cells]) => (
        <div key={colorSlug} className="rounded-lg border p-4 space-y-2">
          <strong className="text-sm">{cells[0].color}</strong>
          <div className="space-y-1">
            {cells.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <span className="w-16 text-sm text-muted-foreground">{row.size}</span>
                <input
                  type="number" min={0} defaultValue={row.quantity}
                  onBlur={(e) => saveQuantity(row, Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                  className={
                    "w-24 rounded border px-2 py-1 text-sm " +
                    (row.quantity <= 0 ? "border-destructive text-destructive" :
                      row.quantity <= lowStockThreshold ? "border-amber-500 text-amber-600" : "")
                  }
                  disabled={pending}
                />
                <button type="button" onClick={() => remove(row)} className="px-1 text-destructive">✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-lg border border-dashed p-4">
        <strong className="mb-2 block text-sm">+ Add color/size</strong>
        <div className="flex flex-wrap items-center gap-2">
          <input value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="Color (e.g. White)" className="rounded border px-2 py-1 text-sm" />
          <input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="Size (e.g. M)" className="w-24 rounded border px-2 py-1 text-sm" />
          <input type="number" min={0} value={newQty} onChange={(e) => setNewQty(e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" />
          <button type="button" onClick={addCell} disabled={pending} className="rounded border px-3 py-1 text-sm">Add</button>
        </div>
      </div>
    </div>
  );
}

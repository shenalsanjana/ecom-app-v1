"use client";
import { useState, useTransition } from "react";
import { createDtfDesign, updateDtfDesign, deleteDtfDesign } from "@/app/admin/inventory/actions";

type Design = { id: string; name: string; slug: string; quantity: number; productCount: number };

export function DtfDesignsTable({ designs, lowStockThreshold }: { designs: Design[]; lowStockThreshold: number }) {
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("0");

  function saveQuantity(d: Design, quantity: number) {
    start(async () => {
      const r = await updateDtfDesign(d.id, { name: d.name, quantity });
      if (!r.success) alert(r.error);
    });
  }

  function saveName(d: Design, name: string) {
    if (!name.trim() || name === d.name) return;
    start(async () => {
      const r = await updateDtfDesign(d.id, { name: name.trim(), quantity: d.quantity });
      if (!r.success) alert(r.error);
    });
  }

  function remove(d: Design) {
    if (!confirm(`Delete "${d.name}"?`)) return;
    start(async () => {
      const r = await deleteDtfDesign(d.id);
      if (!r.success) alert(r.error);
    });
  }

  function add() {
    const name = newName.trim();
    const quantity = Math.max(0, Math.trunc(Number(newQty) || 0));
    if (!name) return;
    start(async () => {
      const r = await createDtfDesign({ name, quantity });
      if (!r.success) { alert(r.error); return; }
      setNewName(""); setNewQty("0");
    });
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1.5 font-medium">Design</th>
            <th className="py-1.5 font-medium">Quantity</th>
            <th className="py-1.5 font-medium">Products using it</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody>
          {designs.map((d) => (
            <tr key={d.id} className="border-b last:border-0">
              <td className="py-1.5">
                <input defaultValue={d.name} onBlur={(e) => saveName(d, e.target.value)} className="rounded border px-2 py-1" disabled={pending} />
              </td>
              <td className="py-1.5">
                <input
                  type="number" min={0} defaultValue={d.quantity}
                  onBlur={(e) => saveQuantity(d, Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                  className={
                    "w-24 rounded border px-2 py-1 " +
                    (d.quantity <= 0 ? "border-destructive text-destructive" :
                      d.quantity <= lowStockThreshold ? "border-amber-500 text-amber-600" : "")
                  }
                  disabled={pending}
                />
              </td>
              <td className="py-1.5 text-muted-foreground">{d.productCount}</td>
              <td className="py-1.5">
                <button type="button" onClick={() => remove(d)} disabled={pending} className="text-destructive">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rounded-lg border border-dashed p-3">
        <strong className="mb-2 block text-sm">+ Add design</strong>
        <div className="flex flex-wrap items-center gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Design name (e.g. Cats)" className="rounded border px-2 py-1 text-sm" />
          <input type="number" min={0} value={newQty} onChange={(e) => setNewQty(e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" />
          <button type="button" onClick={add} disabled={pending} className="rounded border px-3 py-1 text-sm">Add</button>
        </div>
      </div>
    </div>
  );
}

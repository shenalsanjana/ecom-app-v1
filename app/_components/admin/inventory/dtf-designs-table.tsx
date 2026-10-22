"use client";
import { useState, useTransition } from "react";
import { createDtfDesign, updateDtfDesign, deleteDtfDesign } from "@/app/admin/inventory/actions";
import { useRouter } from "next/navigation";
import { useStockOperation } from "./use-stock-operation";
import { AvailableCountEditor } from "./available-count-editor";

type Design = { id: string; name: string; slug: string; quantity: number; productCount: number; version: number };

export function DtfDesignsTable({ designs, lowStockThreshold }: { designs: Design[]; lowStockThreshold: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const operation = useStockOperation();
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("0");
  const [error, setError] = useState("");

  function saveName(d: Design, name: string) {
    if (!name.trim() || name === d.name) return;
    start(async () => {
      const r = await updateDtfDesign(d.id, { name: name.trim() });
      if (!r.success) setError(r.error);
    });
  }

  function remove(d: Design) {
    if (!confirm(`Delete "${d.name}"?`)) return;
    start(async () => {
      const r = await deleteDtfDesign(d.id);
      if (!r.success) setError(r.error);
    });
  }

  function add() {
    const name = newName.trim();
    const quantity = Number(newQty);
    if (!name || !newQty.trim() || !Number.isInteger(quantity) || quantity < 0 || quantity > 2_147_483_647) {
      setError("Enter a print name and a whole opening available quantity of zero or more."); return;
    }
    setError("");
    start(async () => {
      const r = await createDtfDesign({ name, quantity, operationKey: operation.keyFor({ name, quantity }) });
      if (!r.success) { setError(r.error); return; }
      operation.complete();
      setNewName(""); setNewQty("0");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Print components share one balance across their linked products. Adjusting an available count requires Save count and excludes units allocated to orders.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1.5 font-medium">DTF print</th>
            <th className="py-1.5 font-medium">Available count</th>
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
                <AvailableCountEditor quantity={d.quantity} version={d.version} label={d.name} disabled={pending} lowStockThreshold={lowStockThreshold}
                  onSave={(quantity, expectedVersion, intent) => updateDtfDesign(d.id, { quantity, expectedVersion, ...intent })} />
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
        <strong className="mb-2 block text-sm">+ Add DTF print</strong>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="New DTF print name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Print name (e.g. Cats)" className="rounded border px-2 py-1 text-sm" />
          <input aria-label="Opening available print quantity" type="number" min={0} max={2147483647} step={1} value={newQty} onChange={(e) => setNewQty(e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" />
          <button type="button" onClick={add} disabled={pending} className="rounded border px-3 py-1 text-sm">Add</button>
        </div>
      </div>
    </div>
  );
}

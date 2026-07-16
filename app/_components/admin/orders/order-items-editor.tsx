"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editItems, addOrderItem, swapOrderItem } from "@/app/admin/orders/actions";
import { formatPrice } from "@/app/_lib/format";
import type { ItemChange } from "@/app/_lib/admin-orders";
import { ProductPicker, type ProductPickerSelection } from "./product-picker";

type Item = {
  id: string; name: string; size: string | null; color: string | null; sku: string | null;
  price: number; quantity: number; sizes: string;
};

export function OrderItemsEditor({ orderId, items, editable }: { orderId: string; items: Item[]; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(items);
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!editing) setDraft(items);
  }, [items, editing]);

  function save() {
    const changes: ItemChange[] = [];
    for (const orig of items) {
      const d = draft.find((x) => x.id === orig.id);
      if (!d) { changes.push({ id: orig.id, remove: true }); continue; }
      if (d.quantity !== orig.quantity) changes.push({ id: orig.id, quantity: d.quantity });
      if (d.size !== orig.size) changes.push({ id: orig.id, size: d.size });
    }
    start(async () => {
      const r = await editItems(orderId, changes);
      alert(r.success ? (r.warning ?? "Saved") : r.error);
      if (r.success) setEditing(false);
      router.refresh();
    });
  }

  function runSwap(itemId: string, selection: ProductPickerSelection) {
    start(async () => {
      const r = await swapOrderItem(orderId, itemId, selection);
      alert(r.success ? (r.warning ?? "Saved") : r.error);
      if (r.success) setSwappingId(null);
      router.refresh();
    });
  }

  function runAdd(selection: ProductPickerSelection) {
    start(async () => {
      const r = await addOrderItem(orderId, selection);
      alert(r.success ? (r.warning ?? "Saved") : r.error);
      if (r.success) setAdding(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Items · {draft.length}</h4>
        {editable && <button onClick={() => setEditing((v) => !v)} className="text-xs text-primary">{editing ? "Cancel" : "✎ Edit"}</button>}
      </div>
      <ul className="mt-2 space-y-2">
        {draft.map((it) => (
          <li key={it.id}>
            {swappingId === it.id ? (
              <div className="rounded border p-2">
                <ProductPicker
                  confirmLabel="Change product"
                  initialQuantity={it.quantity}
                  disabled={pending}
                  onConfirm={(selection) => runSwap(it.id, selection)}
                />
                <button type="button" className="mt-1 text-xs text-muted-foreground" onClick={() => setSwappingId(null)}>Cancel</button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="block">{it.name}{it.size ? ` · ${it.size}` : ""}</span>
                  <span className="block text-xs text-muted-foreground">Color: {it.color ?? "—"} · SKU: {it.sku ?? "—"}</span>
                </span>
                {editing ? (
                  <span className="flex items-center gap-2">
                    {(() => {
                      const sizeOptions = it.sizes ? it.sizes.split(",").map((s) => s.trim()).filter(Boolean) : [];
                      return sizeOptions.length > 0 ? (
                        <select
                          value={it.size ?? ""}
                          className="rounded border px-1 text-sm"
                          onChange={(e) => setDraft((d) => d.map((x) => x.id === it.id ? { ...x, size: e.target.value || null } : x))}
                        >
                          {sizeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : null;
                    })()}
                    <input type="number" min={1} value={it.quantity} className="w-14 rounded border px-1"
                      onChange={(e) => setDraft((d) => d.map((x) => x.id === it.id ? { ...x, quantity: Number(e.target.value) } : x))} />
                    <button className="text-destructive" onClick={() => setDraft((d) => d.filter((x) => x.id !== it.id))}>✕</button>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span>×{it.quantity} @ {formatPrice(it.price)} = {formatPrice(it.price * it.quantity)}</span>
                    {editable && (
                      <button type="button" className="text-xs text-primary" onClick={() => setSwappingId(it.id)}>⇄ Change product</button>
                    )}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing && <button disabled={pending} onClick={save} className="mt-3 rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground">Save changes</button>}
      {editable && !editing && (
        <div className="mt-3 border-t pt-2">
          {adding ? (
            <div className="rounded border p-2">
              <ProductPicker confirmLabel="Add product" disabled={pending} onConfirm={runAdd} />
              <button type="button" className="mt-1 text-xs text-muted-foreground" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="text-xs text-primary" onClick={() => setAdding(true)}>+ Add product</button>
          )}
        </div>
      )}
    </div>
  );
}

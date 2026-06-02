"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editItems } from "@/app/admin/orders/actions";
import { formatPrice } from "@/app/_lib/format";
import type { ItemChange } from "@/app/_lib/admin-orders";

type Item = { id: string; name: string; size: string | null; price: number; quantity: number; sizes: string };

export function OrderItemsEditor({ orderId, items, editable }: { orderId: string; items: Item[]; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(items);
  const [pending, start] = useTransition();
  const router = useRouter();

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

  return (
    <div>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Items · {draft.length}</h4>
        {editable && <button onClick={() => setEditing((v) => !v)} className="text-xs text-primary">{editing ? "Cancel" : "✎ Edit"}</button>}
      </div>
      <ul className="mt-2 space-y-2">
        {draft.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-2">
            <span>{it.name}{it.size ? ` · ${it.size}` : ""}</span>
            {editing ? (
              <span className="flex items-center gap-2">
                <input type="number" min={1} value={it.quantity} className="w-14 rounded border px-1"
                  onChange={(e) => setDraft((d) => d.map((x) => x.id === it.id ? { ...x, quantity: Number(e.target.value) } : x))} />
                <button className="text-destructive" onClick={() => setDraft((d) => d.filter((x) => x.id !== it.id))}>✕</button>
              </span>
            ) : (
              <span>×{it.quantity} · {formatPrice(it.price * it.quantity)}</span>
            )}
          </li>
        ))}
      </ul>
      {editing && <button disabled={pending} onClick={save} className="mt-3 rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground">Save changes</button>}
    </div>
  );
}

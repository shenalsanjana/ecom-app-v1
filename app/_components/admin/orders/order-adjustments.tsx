"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAdjustment, removeAdjustment } from "@/app/admin/orders/actions";
import { formatPrice } from "@/app/_lib/format";

type Adjustment = { id: string; label: string; amount: number };

export function OrderAdjustments({ orderId, adjustments, editable }: { orderId: string; adjustments: Adjustment[]; editable: boolean }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"CHARGE" | "DISCOUNT">("CHARGE");
  const [pending, start] = useTransition();
  const router = useRouter();

  function add() {
    const parsedAmount = Number(amount);
    start(async () => {
      const r = await addAdjustment(orderId, { label, amount: parsedAmount, kind });
      if (r.success) { setLabel(""); setAmount(""); } else { alert(r.error); }
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      const r = await removeAdjustment(orderId, id);
      if (!r.success) alert(r.error);
      router.refresh();
    });
  }

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Adjustments</h4>
      {adjustments.length === 0 && <p className="text-sm text-muted-foreground">No custom charges or discounts.</p>}
      <ul className="space-y-1 text-sm">
        {adjustments.map((a) => (
          <li key={a.id} className="flex items-center justify-between">
            <span>{a.label}</span>
            <span className="flex items-center gap-2">
              <span>{a.amount < 0 ? "−" : "+"}{formatPrice(Math.abs(a.amount))}</span>
              {editable && <button className="text-destructive" disabled={pending} onClick={() => remove(a.id)}>✕</button>}
            </span>
          </li>
        ))}
      </ul>
      {editable && (
        <div className="mt-2 space-y-1 border-t pt-2">
          <div className="flex gap-2">
            <button type="button" onClick={() => setKind("CHARGE")}
              className={`rounded border px-2 py-1 text-xs ${kind === "CHARGE" ? "bg-primary text-primary-foreground" : ""}`}>Charge</button>
            <button type="button" onClick={() => setKind("DISCOUNT")}
              className={`rounded border px-2 py-1 text-xs ${kind === "DISCOUNT" ? "bg-primary text-primary-foreground" : ""}`}>Discount</button>
          </div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Rush fee)"
            className="w-full rounded border px-2 py-1 text-sm" />
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount"
            className="w-full rounded border px-2 py-1 text-sm" />
          <button disabled={pending || !label.trim() || !amount} onClick={add}
            className="rounded-md border px-3 py-1 text-sm">Add {kind === "CHARGE" ? "charge" : "discount"}</button>
        </div>
      )}
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editAddress } from "@/app/admin/orders/actions";

type Addr = { line1: string; line2: string | null; city: string; country: string };

export function AddressEditor({ orderId, address, locked }: { orderId: string; address: Addr; locked: boolean }) {
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState(address);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof Addr) => (e: React.ChangeEvent<HTMLInputElement>) => setA((p) => ({ ...p, [k]: e.target.value }));

  if (!editing) {
    return (
      <div>
        {!locked && <button className="float-right text-xs text-primary" onClick={() => setEditing(true)}>✎ Edit</button>}
        <div>{address.line1}<br />{address.line2 && <>{address.line2}<br /></>}{address.city}<br />{address.country}</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {(["line1", "line2", "city", "country"] as const).map((k) => (
        <input key={k} value={a[k] ?? ""} onChange={set(k)} placeholder={k} className="w-full rounded border px-2 py-1 text-sm" />
      ))}
      <button disabled={pending} className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground"
        onClick={() => start(async () => {
          const r = await editAddress(orderId, { line1: a.line1, line2: a.line2 ?? "", city: a.city, country: a.country });
          alert(r.success ? "Saved" : r.error); if (r.success) setEditing(false); router.refresh();
        })}>Save</button>
    </div>
  );
}

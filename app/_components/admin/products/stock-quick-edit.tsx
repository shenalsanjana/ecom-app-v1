"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStock } from "@/app/admin/products/actions";

export function StockQuickEdit({ id, value }: { id: string; value: number }) {
  const [v, setV] = useState(String(value));
  const [pending, start] = useTransition();
  const router = useRouter();
  function save() {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n === value) return;
    start(async () => { const r = await updateStock(id, n); if (!r.success) alert(r.error); router.refresh(); });
  }
  return (
    <input
      type="number" min={0} value={v} disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-16 rounded border px-1 py-0.5 text-sm"
    />
  );
}

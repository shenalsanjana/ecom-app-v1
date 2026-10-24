"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCustomDesignReceived } from "@/app/admin/orders/custom-design-actions";

export function CustomDesignReceipt({ orderId, items, locked }: {
  orderId: string; items: { id: string; name: string; isCustomizedDesign: boolean; designReceivedAt: Date | null }[]; locked: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const custom = items.filter(item => item.isCustomizedDesign);
  if (!custom.length) return null;
  return <section aria-label="Customized design files" className="space-y-3 rounded-lg border p-4 text-sm">
    <h2 className="font-semibold">Customized design files</h2>
    <p className="text-muted-foreground">Confirm receipt after checking the customer’s PNG files in Business WhatsApp. Pending items keep the customer’s reminder visible.</p>
    {custom.map(item => <div key={item.id} className="space-y-1 border-t pt-3">
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={!!item.designReceivedAt} disabled={pending || locked}
        onChange={event => { const received = event.target.checked; setError(""); start(async () => {
          try { const result = await setCustomDesignReceived(orderId, item.id, received); if (!result.success) setError(result.error); else router.refresh(); }
          catch { setError("Could not update design receipt. Please try again."); }
        }); }} /><span>Design received for {item.name}</span></label>
      {item.designReceivedAt && <p className="pl-6 text-xs text-muted-foreground">Received {new Date(item.designReceivedAt).toLocaleDateString("en-LK", { timeZone: "Asia/Colombo" })}</p>}
    </div>)}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section>;
}

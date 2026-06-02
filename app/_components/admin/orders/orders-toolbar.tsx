"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { ORDER_TABS, type OrderTab } from "@/app/_lib/admin-orders";

const TAB_LABEL: Record<OrderTab, string> = {
  all: "All", "needs-dispatch": "Needs dispatch", "pending-cod": "Pending COD",
  delivered: "Delivered", cancelled: "Cancelled",
};

export function OrdersToolbar({ counts }: { counts: Record<OrderTab, number> }) {
  const router = useRouter();
  const sp = useSearchParams();
  const activeTab = (sp.get("tab") as OrderTab) || "all";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    router.push(`/admin/orders?${next.toString()}`);
  }

  return (
    <div className="mb-4">
      <input
        defaultValue={sp.get("q") ?? ""}
        placeholder="Search order #, customer, phone, email…"
        className="w-full rounded-md border px-3 py-2 text-sm"
        onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {ORDER_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setParam("tab", t === "all" ? "" : t)}
            className={
              (activeTab === t ? "bg-primary text-primary-foreground " : "bg-secondary text-muted-foreground ") +
              "rounded-full px-3 py-1 text-xs font-medium"
            }
          >
            {TAB_LABEL[t]} <span className="opacity-70">{counts[t]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

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

  const selectCls = "rounded-md border bg-background px-2 py-1 text-sm text-foreground";

  return (
    <div className="mb-4">
      <input
        defaultValue={sp.get("q") ?? ""}
        placeholder="Search order #, customer, phone, email…"
        className="w-full rounded-md border px-3 py-2 text-sm"
        onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={sp.get("status") ?? ""}
          onChange={(e) => setParam("status", e.target.value)}
          className={selectCls}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="DELIVERED">Delivered</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select
          value={sp.get("payment") ?? ""}
          onChange={(e) => setParam("payment", e.target.value)}
          className={selectCls}
          aria-label="Filter by payment"
        >
          <option value="">All payments</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="COD_PENDING">COD Pending</option>
          <option value="COD_COLLECTED">COD Collected</option>
          <option value="PAYMENT_FAILED">Payment Failed</option>
        </select>
        <select
          value={sp.get("sort") || "newest"}
          onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)}
          className={selectCls}
          aria-label="Sort orders"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
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

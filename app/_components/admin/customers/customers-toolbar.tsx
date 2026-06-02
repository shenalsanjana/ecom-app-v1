"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { CUSTOMER_TABS, type CustomerTab } from "@/app/_lib/customer-tabs";

const TAB_LABEL: Record<CustomerTab, string> = { customers: "Customers", admins: "Admins", all: "All" };
const SORTS = [["newest", "Newest"], ["name", "Name"], ["orders", "Orders"], ["spent", "Spent"]] as const;

export function CustomersToolbar({ counts }: { counts: Record<CustomerTab, number> }) {
  const router = useRouter();
  const sp = useSearchParams();
  const activeTab = (sp.get("role") as CustomerTab) || "customers";
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    router.push(`/admin/customers?${next.toString()}`);
  }
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          defaultValue={sp.get("q") ?? ""}
          placeholder="Search name or email…"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }}
        />
        <select className="rounded-md border px-2 py-2 text-sm" defaultValue={sp.get("sort") ?? "newest"}
          onChange={(e) => setParam("sort", e.target.value)}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {CUSTOMER_TABS.map((t) => (
          <button key={t} onClick={() => setParam("role", t === "customers" ? "" : t)}
            className={(activeTab === t ? "bg-primary text-primary-foreground " : "bg-secondary text-muted-foreground ") + "rounded-full px-3 py-1 text-xs font-medium"}>
            {TAB_LABEL[t]} <span className="opacity-70">{counts[t]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

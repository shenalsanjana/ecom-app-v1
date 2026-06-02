"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PRODUCT_TABS, type ProductTab } from "@/app/_lib/product-helpers";

const TAB_LABEL: Record<ProductTab, string> = {
  active: "Active", "low-stock": "Low stock", archived: "Archived", all: "All",
};

export function ProductsToolbar({ categories, counts }: { categories: { slug: string; name: string }[]; counts: Record<ProductTab, number> }) {
  const router = useRouter();
  const sp = useSearchParams();
  const activeTab = (sp.get("tab") as ProductTab) || "active";
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    router.push(`/admin/products?${next.toString()}`);
  }
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          defaultValue={sp.get("q") ?? ""}
          placeholder="Search name or slug…"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }}
        />
        <select className="rounded-md border px-2 py-2 text-sm" defaultValue={sp.get("category") ?? ""}
          onChange={(e) => setParam("category", e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <Link href="/admin/products/new" className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">＋ New product</Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRODUCT_TABS.map((t) => (
          <button key={t} onClick={() => setParam("tab", t === "active" ? "" : t)}
            className={(activeTab === t ? "bg-primary text-primary-foreground " : "bg-secondary text-muted-foreground ") + "rounded-full px-3 py-1 text-xs font-medium"}>
            {TAB_LABEL[t]} <span className="opacity-70">{counts[t]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

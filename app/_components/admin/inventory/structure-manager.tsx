"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { categoryOptions, type InventoryCategoryRow } from "@/app/_lib/inventory-structure";
import { saveInventoryCategory, deleteInventoryCategory, saveInventoryProduct, deleteInventoryProduct } from "@/app/admin/inventory/structure-actions";

type Parent = { id: string; name: string; categoryId: string; version: number };

export function InventoryStructureManager({ categories, products }: { categories: InventoryCategoryRow[]; products: Parent[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"category" | "product">("category");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(categories.find(c => c.systemKey === "accessories")?.id ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const options = categoryOptions(categories).filter(option => categories.find(row => row.id === option.id)?.systemKey !== "tshirts");
  const current = kind === "category" ? categories.find(c => c.id === id) : products.find(p => p.id === id);
  function choose(value: string) {
    setId(value); setError("");
    const row = kind === "category" ? categories.find(c => c.id === value) : products.find(p => p.id === value);
    setName(row?.name ?? "");
    if (row) setParentId("categoryId" in row ? row.categoryId : row.parentId ?? "");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    start(async () => {
      const common = { ...(id ? { id, expectedVersion: current?.version } : {}), name };
      const result = kind === "category" ? await saveInventoryCategory({ ...common, parentId }) : await saveInventoryProduct({ ...common, categoryId: parentId });
      if (!result.success) { setError(result.error); return; }
      setId(""); setName(""); router.refresh();
    });
  }
  return <details className="rounded-lg border bg-background">
    <summary className="cursor-pointer p-4 text-sm font-medium">Manage physical categories & families</summary>
    <form onSubmit={submit} className="space-y-3 border-t p-4">
      <p className="text-xs text-muted-foreground">Physical categories organise blank families. Store collections organise shopping pages independently; they do not create stock.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm"><span className="block">Manage</span><select value={kind} disabled={pending} onChange={event => { setKind(event.target.value as typeof kind); setId(""); setName(""); setError(""); }} className="w-full rounded border bg-background px-2 py-2"><option value="category">Physical category / subcategory</option><option value="product">Physical family</option></select></label>
        <label className="space-y-1 text-sm"><span className="block">Create or edit</span><select value={id} disabled={pending} onChange={event => choose(event.target.value)} className="w-full rounded border bg-background px-2 py-2"><option value="">Create new…</option>
          {(kind === "category" ? categories.filter(c => !c.systemKey) : products).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
        <label className="space-y-1 text-sm"><span className="block">Name</span><input value={name} required maxLength={kind === "category" ? 120 : 160} disabled={pending} onChange={event => setName(event.target.value)} className="w-full rounded border bg-background px-2 py-2" /></label>
        <label className="space-y-1 text-sm"><span className="block">{kind === "category" ? "Parent category" : "Category"}</span><select value={parentId} required disabled={pending} onChange={event => setParentId(event.target.value)} className="w-full rounded border bg-background px-2 py-2">
          {options.filter(option => kind !== "category" || option.id !== id).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select></label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3"><button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{pending ? "Saving…" : id ? "Save changes" : "Create"}</button>
        {id && <button type="button" disabled={pending} className="rounded-md border px-4 py-2 text-sm text-destructive" onClick={() => {
          if (!current || !confirm(`Delete ${current.name}? Only empty entries can be deleted.`)) return;
          start(async () => {
            const result = kind === "category" ? await deleteInventoryCategory(id, current.version) : await deleteInventoryProduct(id, current.version);
            if (!result.success) { setError(result.error); return; }
            setId(""); setName(""); router.refresh();
          });
        }}>Delete empty entry</button>}
      </div>
    </form>
  </details>;
}

"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct, archiveProduct, unarchiveProduct } from "@/app/admin/products/actions";
import { slugify } from "@/app/_lib/product-helpers";
import { CategorySelect } from "./category-select";
import { VariantEditor, emptyVariant, type VariantDraft } from "./variant-editor";

type Cat = { slug: string; name: string };
type Initial = {
  id?: string; name: string; categorySlug: string; price: string; originalPrice: string;
  description: string; archived: boolean; variants: VariantDraft[];
};

function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function ProductForm({ mode, categories, initial }: { mode: "create" | "edit"; categories: Cat[]; initial: Initial }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState(initial.id ?? "");
  const [pending, start] = useTransition();
  const set = <K extends keyof Initial>(k: K, v: Initial[K]) => setF((p) => ({ ...p, [k]: v }));

  function submit() {
    const input = {
      name: f.name.trim(), slug, categorySlug: f.categorySlug,
      price: Number(f.price), originalPrice: toNum(f.originalPrice),
      description: f.description.trim(),
      variants: f.variants.map((v) => ({
        id: v.id,
        color: v.color.trim(),
        colorSlug: v.colorSlug.trim(),
        swatchHex: v.swatchHex.trim() || null,
        sku: v.sku.trim() || null,
        price: toNum(v.price),
        originalPrice: toNum(v.originalPrice),
        cardImages: v.cardImages.map((u) => u.trim()).filter(Boolean),
        detailImages: v.detailImages.map((u) => u.trim()).filter(Boolean),
        sizeStocks: v.sizeStocks
          .map((s) => ({ size: s.size.trim(), stock: Math.max(0, Math.trunc(Number(s.stock) || 0)) }))
          .filter((s) => s.size),
      })),
    };
    start(async () => {
      const r = mode === "create" ? await createProduct(input) : await updateProduct(f.id!, input);
      if (!r.success) { alert(r.error); return; }
      router.push("/admin/products"); router.refresh();
    });
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{mode === "create" ? "New product" : `Edit · ${f.name}`}</h1>
        <span className="ml-auto flex gap-2">
          {mode === "edit" && (
            <a href={`/products/${f.id}`} target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-1.5 text-sm">View on storefront ↗</a>
          )}
          {mode === "edit" && (
            <button disabled={pending} onClick={() => start(async () => { const r = f.archived ? await unarchiveProduct(f.id!) : await archiveProduct(f.id!); if (r.success) { set("archived", !f.archived); router.refresh(); } else alert(r.error); })}
              className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive">{f.archived ? "Unarchive" : "Archive"}</button>
          )}
          <button onClick={() => router.push("/admin/products")} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
          <button disabled={pending} onClick={submit} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">Save</button>
        </span>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border p-4 space-y-3">
          <div><label className="text-xs text-muted-foreground">Name</label>
            <input value={f.name} className="w-full rounded border px-2 py-1.5 text-sm"
              onChange={(e) => { set("name", e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} /></div>
          <div><label className="text-xs text-muted-foreground">Slug (URL id)</label>
            <input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} className="w-full rounded border px-2 py-1.5 text-sm" /></div>
          <div><label className="text-xs text-muted-foreground">Category</label>
            <CategorySelect categories={categories} value={f.categorySlug} onChange={(s) => set("categorySlug", s)} /></div>
        </div>

        <div className="rounded-lg border p-4 grid grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">Base price (LKR)</label><input value={f.price} onChange={(e) => set("price", e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" /></div>
          <div><label className="text-xs text-muted-foreground">Base original price</label><input value={f.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} placeholder="optional" className="w-full rounded border px-2 py-1.5 text-sm" /></div>
        </div>

        <div className="rounded-lg border p-4">
          <label className="text-xs text-muted-foreground">Description</label>
          <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={4} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Color variants</h2>
          <VariantEditor value={f.variants} onChange={(v) => set("variants", v)} />
        </div>
      </div>
    </section>
  );
}

export { emptyVariant };
export type { VariantDraft };

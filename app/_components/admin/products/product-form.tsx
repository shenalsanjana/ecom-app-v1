"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createProduct, updateProduct, archiveProduct, unarchiveProduct } from "@/app/admin/products/actions";
import { slugify, parseSizes, serializeSizes } from "@/app/_lib/product-helpers";
import { CategorySelect } from "./category-select";
import { GalleryEditor } from "./gallery-editor";

type Cat = { slug: string; name: string };
type Initial = {
  id?: string; name: string; categorySlug: string; price: string; originalPrice: string;
  stock: string; sizesCsv: string; description: string; image: string; gallery: string[]; archived: boolean;
};

const STD_SIZES = ["S", "M", "L", "XL"];

export function ProductForm({ mode, categories, initial }: { mode: "create" | "edit"; categories: Cat[]; initial: Initial }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [slug, setSlug] = useState(initial.id ?? "");
  const [pending, start] = useTransition();
  const set = <K extends keyof Initial>(k: K, v: Initial[K]) => setF((p) => ({ ...p, [k]: v }));

  const [customSize, setCustomSize] = useState("");
  const sizes = parseSizes(f.sizesCsv);
  const toggleSize = (s: string) => set("sizesCsv", serializeSizes(sizes.includes(s) ? sizes.filter((x) => x !== s) : [...sizes, s]));
  const addCustomSize = () => {
    const s = customSize.trim();
    if (!s || sizes.includes(s)) { setCustomSize(""); return; }
    set("sizesCsv", serializeSizes([...sizes, s]));
    setCustomSize("");
  };

  function submit() {
    const input = {
      name: f.name.trim(), slug: mode === "create" ? slug : undefined, categorySlug: f.categorySlug,
      price: Number(f.price), originalPrice: f.originalPrice ? Number(f.originalPrice) : null,
      stock: Number(f.stock), sizes, description: f.description.trim(), image: f.image.trim(),
      gallery: f.gallery.map((g) => g.trim()).filter(Boolean),
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-lg border p-4 space-y-3">
            <div><label className="text-xs text-muted-foreground">Name</label>
              <input value={f.name} className="w-full rounded border px-2 py-1.5 text-sm"
                onChange={(e) => { set("name", e.target.value); if (mode === "create" && !slugTouched) setSlug(slugify(e.target.value)); }} /></div>
            <div><label className="text-xs text-muted-foreground">Slug (URL id)</label>
              <input value={mode === "create" ? slug : f.id} readOnly={mode === "edit"}
                onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
                className={"w-full rounded border px-2 py-1.5 text-sm " + (mode === "edit" ? "bg-secondary text-muted-foreground" : "")} /></div>
            <div><label className="text-xs text-muted-foreground">Category</label>
              <CategorySelect categories={categories} value={f.categorySlug} onChange={(s) => set("categorySlug", s)} /></div>
          </div>
          <div className="rounded-lg border p-4 grid grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground">Price (LKR)</label><input value={f.price} onChange={(e) => set("price", e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-muted-foreground">Original price</label><input value={f.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} placeholder="optional" className="w-full rounded border px-2 py-1.5 text-sm" /></div>
            <div><label className="text-xs text-muted-foreground">Stock</label><input value={f.stock} onChange={(e) => set("stock", e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" /></div>
          </div>
          <div className="rounded-lg border p-4">
            <label className="text-xs text-muted-foreground">Sizes</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {STD_SIZES.map((s) => (
                <button key={s} type="button" onClick={() => toggleSize(s)}
                  className={"rounded-full px-3 py-1 text-xs " + (sizes.includes(s) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{s}</button>
              ))}
              {sizes.filter((s) => !STD_SIZES.includes(s)).map((s) => (
                <button key={s} type="button" onClick={() => toggleSize(s)}
                  className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">{s} ✕</button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={customSize}
                onChange={(e) => setCustomSize(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSize(); } }}
                placeholder="+ add custom"
                className="rounded border px-2 py-1 text-xs w-28"
              />
              <button type="button" onClick={addCustomSize} className="rounded border px-2 py-1 text-xs">Add</button>
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <label className="text-xs text-muted-foreground">Description</label>
            <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={4} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <label className="text-xs text-muted-foreground">Main image (URL / path)</label>
            <input value={f.image} onChange={(e) => set("image", e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
            {f.image ? <Image src={f.image} alt="" width={240} height={160} className="mt-2 h-32 w-full rounded object-cover" /> : null}
          </div>
          <div className="rounded-lg border p-4">
            <label className="mb-2 block text-xs text-muted-foreground">Gallery</label>
            <GalleryEditor urls={f.gallery} onChange={(u) => set("gallery", u)} />
          </div>
        </div>
      </div>
    </section>
  );
}

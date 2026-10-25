"use client";
import { moneyInput } from "@/app/_lib/sales/input";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct, archiveProduct, unarchiveProduct, unpublishProduct } from "@/app/admin/products/actions";
import { slugify } from "@/app/_lib/product-helpers";
import Link from "next/link";
import type { StockMode } from "@/app/_lib/stock-policy";
import { CategorySelect, type StoreCollection, type ShopDepartment } from "./category-select";
import { AdditionalCollections } from "./additional-collections";
import { VariantEditor } from "./variant-editor";
import { emptyVariant, familyColors, type VariantDraft, type InventoryStockChoice } from "./variant-draft";

type Design = { id: string; name: string };
type Initial = {
  id?: string; name: string; designSlug: string; price: string; originalPrice: string;
  description: string; archived: boolean; dtfDesignId: string; variants: VariantDraft[];
  inventoryProductId?: string | null;
  additionalCollectionSlugs?: string[];
  status?: "DRAFT" | "PUBLISHED";
  stockMode?: StockMode;
  isCustomizedDesign?: boolean;
  costPrice?: string;
};

function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function ProductForm({
  mode, categories, departments, designs, initial, inventoryParents = [], stockOptions = [],
}: {
  mode: "create" | "edit"; categories: StoreCollection[]; departments: ShopDepartment[]; designs: Design[]; initial: Initial;
  inventoryParents?: { id: string; name: string; section?: string | null }[]; stockOptions?: InventoryStockChoice[];
}) {
  const router = useRouter();
  const [f, setF] = useState<Initial>({ ...initial, costPrice: initial.costPrice ?? "", isCustomizedDesign: initial.isCustomizedDesign ?? false, stockMode: initial.stockMode ?? "PRINTED_TO_ORDER", status: initial.status ?? (mode === "create" ? "DRAFT" : "PUBLISHED") });
  const [collections, setCollections] = useState(categories);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState(initial.id ?? "");
  const [pending, start] = useTransition();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const set = <K extends keyof Initial>(k: K, v: Initial[K]) => setF((p) => ({ ...p, [k]: v }));
  const section = inventoryParents.find(parent => parent.id === f.inventoryProductId)?.section;
  const parent = inventoryParents.find(row => row.id === f.inventoryProductId);
  const knownColors = familyColors(stockOptions, f.inventoryProductId);
  const pinned = new Set(f.variants.flatMap(variant => variant.sizeStocks.flatMap(cell => cell.plainTshirtStockId ? [cell.plainTshirtStockId] : [])));
  const compatibleStock = stockOptions.filter(row => row.section === section || pinned.has(row.id));
  const visible = (value: number) => mode === "edit" || step === value;

  function detailsError(publishing = false) {
    if (!f.name.trim()) return "Enter a product name.";
    if (!f.designSlug) return "Choose a store collection.";
    if (!Number.isFinite(Number(f.price)) || Number(f.price) <= 0) return "Enter a positive selling price.";
    try { moneyInput(f.costPrice ?? "", true); } catch { return "Enter a non-negative cost price with at most two decimal places, or leave it blank."; }
    if (publishing && !f.description.trim()) return "Enter a product description.";
    if (publishing && f.stockMode !== "PLAIN" && !f.dtfDesignId) return "Choose the DTF print used by this product.";
    return null;
  }
  function next() {
    const message = step === 1 ? null : detailsError();
    if (message) { setError(message); return; }
    setError(""); setStep(current => Math.min(current + 1, 3));
  }

  function submit(status: "DRAFT" | "PUBLISHED") {
    if (pending) return;
    if (status === "PUBLISHED" && !f.inventoryProductId) { setError("Choose a physical product family before publishing."); setStep(1); return; }
    const message = detailsError(status === "PUBLISHED");
    if (message) { setError(message); setStep(2); return; }
    setError("");
    const input = {
      name: f.name.trim(), slug, designSlug: f.designSlug, status,
      additionalCollectionSlugs: (f.additionalCollectionSlugs ?? []).filter(value => value !== f.designSlug),
      price: Number(f.price), originalPrice: toNum(f.originalPrice),
      description: f.description.trim(),
      dtfDesignId: f.dtfDesignId || null,
      stockMode: f.stockMode,
      isCustomizedDesign: f.isCustomizedDesign,
      costPriceCents: moneyInput(f.costPrice ?? "", true),
      inventoryProductId: f.inventoryProductId || null,
      variants: f.variants.filter(v => v.id || v.color.trim() || v.sizeStocks.length || v.cardImages.some(url => url.trim()) || v.detailImages.some(url => url.trim())).map((v) => ({
        id: v.id,
        color: v.color.trim(),
        colorSlug: v.colorSlug.trim(),
        swatchHex: v.swatchHex.trim() || null,
        sku: v.sku.trim() || null,
        price: toNum(v.price),
        originalPrice: toNum(v.originalPrice),
        cardImages: v.cardImages.map((u) => u.trim()).filter(Boolean),
        detailImages: v.detailImages.map((u) => u.trim()).filter(Boolean),
        sizeStocks: v.sizeStocks.map((s) => ({ ...(s.id ? { id: s.id } : {}), size: s.size.trim(), plainTshirtStockId: s.plainTshirtStockId })).filter((s) => s.size),
      })),
    };
    start(async () => {
      try {
        const r = mode === "create" ? await createProduct(input) : await updateProduct(f.id!, input);
        if (!r.success) { setError(r.error); return; }
        router.push("/admin/products"); router.refresh();
      } catch { setError("Could not save the product. Please try again."); }
    });
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{mode === "create" ? "New design product" : `Edit · ${f.name}`}</h1>
        <span className="rounded-full border px-2 py-1 text-xs">{f.archived ? "Archived · " : ""}{f.status === "PUBLISHED" ? "Published" : "Draft"}</span>
        <span className="ml-auto flex gap-2">
          {mode === "edit" && f.status === "PUBLISHED" && !f.archived && (
            <a href={`/products/${f.id}`} target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-1.5 text-sm">View on storefront ↗</a>
          )}
          {mode === "edit" && (
            <button disabled={pending} onClick={() => start(async () => { const r = f.archived ? await unarchiveProduct(f.id!) : await archiveProduct(f.id!); if (r.success) { set("archived", !f.archived); router.refresh(); } else setError(r.error); })}
              className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive">{f.archived ? "Unarchive" : "Archive"}</button>
          )}
          <button onClick={() => router.push("/admin/products")} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
          {mode === "edit" && f.status === "PUBLISHED" && <button disabled={pending} onClick={() => start(async () => {
            try { const result = await unpublishProduct(f.id!); if (!result.success) { setError(result.error); return; } set("status", "DRAFT"); router.refresh(); }
            catch { setError("Could not unpublish the product. Please try again."); }
          })} className="rounded-md border px-3 py-1.5 text-sm">Unpublish</button>}
          <button disabled={pending} onClick={() => submit(f.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT")} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">{pending ? "Saving…" : f.status === "PUBLISHED" ? "Save changes" : "Save draft"}</button>
          {f.status !== "PUBLISHED" && !f.archived && (mode === "edit" || step === 3) && <button disabled={pending} onClick={() => submit("PUBLISHED")} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Saving…" : "Publish"}</button>}
        </span>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">Save a draft with a name, primary collection and selling price. Complete the family, description, print, images and sizes before publishing. Stock remains shared in Inventory.</p>
      {mode === "create" && <nav aria-label="Product creation steps" className="mb-5 grid grid-cols-3 gap-2">
        {["Physical family", "Product details", "Colours & sizes"].map((label, index) => <span key={label} aria-current={step === index + 1 ? "step" : undefined}
          className={`border-b-2 px-2 py-3 text-xs sm:text-sm ${step === index + 1 ? "border-primary font-semibold" : "border-border text-muted-foreground"}`}>{index + 1}. {label}</span>)}
      </nav>}
      {error && <p role="alert" className="mb-4 rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
      <fieldset disabled={pending} className="space-y-4">
        <div hidden={!visible(1)} className="rounded-lg border bg-secondary/10 p-4 space-y-3">
          <h2 className="text-sm font-semibold">1. Physical family</h2>
          <div><label htmlFor="inventory-parent" className="text-xs text-muted-foreground">Physical product family</label>
            <select id="inventory-parent" value={f.inventoryProductId ?? ""} onChange={event => setF(previous => ({ ...previous,
              inventoryProductId: event.target.value || null,
              variants: previous.variants.map(variant => ({ ...variant, ...(mode === "create" ? { color: "", colorSlug: "", sizeStocks: [] } : { sizeStocks: variant.sizeStocks.map(cell => ({ id: cell.id, sku: cell.sku, size: cell.size })) }) })),
            }))} className="w-full rounded border px-2 py-1.5 text-sm">
              <option value="">Select a physical family…</option>
              {inventoryParents.map(parent => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Optional for a draft; required before publishing. The family determines the physical category and shared blanks. <Link href="/admin/inventory" className="underline">Manage physical families in Inventory</Link>.</p>
          </div>
          {parent && <p className="rounded-md bg-secondary p-3 text-sm"><strong>Selected:</strong> {parent.name}. Creating this design does not create another stock balance.</p>}
        </div>
        <div hidden={!visible(2)} className="space-y-4">
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="text-sm font-semibold">2. Product details</h2>
          <div><label htmlFor="product-name" className="text-xs text-muted-foreground">Product / design name</label>
            <input id="product-name" value={f.name} className="w-full rounded border px-2 py-1.5 text-sm"
              onChange={(e) => { set("name", e.target.value); if (mode === "create" && !slugTouched) setSlug(slugify(e.target.value)); }} /></div>
          <div><label htmlFor="store-collection" className="text-xs text-muted-foreground">Primary collection</label>
            <CategorySelect categories={collections} departments={departments} value={f.designSlug}
              onCreated={collection => setCollections(previous => [...previous, collection])}
              onChange={designSlug => setF(previous => ({ ...previous, designSlug, additionalCollectionSlugs: (previous.additionalCollectionSlugs ?? []).filter(slug => slug !== designSlug) }))} />
            <p className="mt-1 text-xs text-muted-foreground">Used for this product’s breadcrumb and primary department. This choice does not move its physical stock.</p></div>
          <AdditionalCollections categories={collections} departments={departments} primary={f.designSlug}
            value={f.additionalCollectionSlugs ?? []} onChange={slugs => set("additionalCollectionSlugs", slugs)} />
          <div className="space-y-1 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.isCustomizedDesign === true}
              onChange={event => set("isCustomizedDesign", event.target.checked)} />Customized Design Product</label>
            <p className="text-xs text-muted-foreground">Show the Business WhatsApp design button and remind customers to send PNG design files. Purchases remain available.</p>
          </div>
          <div><label htmlFor="stock-mode" className="text-xs text-muted-foreground">How is this item fulfilled?</label>
            <select id="stock-mode" value={f.stockMode} onChange={event => set("stockMode", event.target.value as StockMode)} className="w-full rounded border px-2 py-1.5 text-sm">
              <option value="PRINTED_TO_ORDER">Printed to order — shared blank + print</option>
              <option value="PLAIN">Plain item — shared blank only</option>
            </select><p className="mt-1 text-xs text-muted-foreground">Existing orders keep their original stock sources when this setting changes.</p></div>
          <div hidden={f.stockMode === "PLAIN"}><label htmlFor="product-print" className="text-xs text-muted-foreground">DTF print component</label>
            <select id="product-print" value={f.dtfDesignId} onChange={(e) => set("dtfDesignId", e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
              <option value="">Select the print used by this product…</option>
              {designs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-lg border p-4 grid grid-cols-2 gap-3">
          <div><label htmlFor="product-price" className="text-xs text-muted-foreground">Selling price (LKR)</label><input id="product-price" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" /></div>
          <div><label htmlFor="product-cost" className="text-xs text-muted-foreground">Cost price per unit (LKR, optional)</label><input id="product-cost" inputMode="decimal" value={f.costPrice ?? ""} onChange={event => set("costPrice", event.target.value)} placeholder="Unknown" className="w-full rounded border px-2 py-1.5 text-sm" /><p className="mt-1 text-xs text-muted-foreground">Internal product cost for gross profit. Applies to new order items; historical costs can be recorded on each order.</p></div>
          <div><label htmlFor="product-original-price" className="text-xs text-muted-foreground">Original price (optional)</label><input id="product-original-price" inputMode="decimal" value={f.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" /></div>
        </div>

        <div className="rounded-lg border p-4">
          <label htmlFor="product-description" className="text-xs text-muted-foreground">Description</label>
          <textarea id="product-description" value={f.description} onChange={(e) => set("description", e.target.value)} rows={4} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
        </div>
        <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm">Advanced: product URL</summary>
          <label htmlFor="product-slug" className="mt-3 block text-xs text-muted-foreground">URL slug</label><input id="product-slug" value={slug} onChange={event => { setSlugTouched(true); setSlug(slugify(event.target.value)); }} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
          <p className="mt-2 text-xs text-muted-foreground">{mode === "edit" ? "Changing the product name keeps its existing URL. Deliberate URL changes retain the existing redirect behaviour." : "The URL is generated from the product name. Edit it here if a different URL is needed."}</p>
        </details>
        </div>
        <div hidden={!visible(3)} className="space-y-3">
          <h2 className="text-sm font-semibold">3. Colours, sizes and images</h2>
          {!knownColors.length && <p className="rounded-md border p-3 text-sm text-muted-foreground">This family has no blank colours configured. Add colour / size stock in Inventory before offering new variants. Existing saved variants remain available for editing.</p>}
          <VariantEditor value={f.variants} onChange={(v) => set("variants", v)} knownColors={knownColors} stockOptions={compatibleStock} inventoryProductId={f.inventoryProductId} />
          <div className="rounded-lg border bg-secondary/20 p-4 text-sm"><strong>Stock preview:</strong> {parent?.name ?? "Choose a physical family"}. {f.stockMode === "PLAIN" ? "Each sale uses the selected shared blank only; no print is required or deducted." : "Each sale uses the selected shared blank and print; no separate design quantity is added."}</div>
        </div>
      </fieldset>
      {mode === "create" && <div className="mt-5 flex flex-wrap gap-2">
        {step > 1 && <button disabled={pending} onClick={() => { setError(""); setStep(current => current - 1); }} className="rounded-md border px-4 py-2 text-sm">Back</button>}
        {step < 3 ? <button disabled={pending} onClick={next} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Continue →</button>
          : <><button disabled={pending} onClick={() => submit("DRAFT")} className="rounded-md border px-4 py-2 text-sm">{pending ? "Saving…" : "Save draft"}</button><button disabled={pending} onClick={() => submit("PUBLISHED")} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{pending ? "Saving…" : "Publish"}</button></>}
      </div>}
    </section>
  );
}

export { emptyVariant };
export type { VariantDraft };

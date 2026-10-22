"use client";
import { useState } from "react";
import { GalleryEditor } from "./gallery-editor";
import { emptyVariant, addOfferedSizes, familyStockOptions, type VariantDraft, type InventoryStockChoice } from "./variant-draft";
import { sizeRank } from "@/app/_lib/variants";

// Re-export so existing client-side imports (product-form) keep working.
// Server components must import emptyVariant from ./variant-draft directly.
export { emptyVariant };
export type { VariantDraft };
export type { InventoryStockChoice };

export type KnownColor = { color: string; colorSlug: string };

export function VariantEditor({
  value,
  onChange,
  knownColors = [],
  stockOptions = [],
  inventoryProductId,
}: {
  value: VariantDraft[];
  onChange: (v: VariantDraft[]) => void;
  // New colour choices come from the selected physical family. Existing saved
  // colours remain selectable so editing never silently discards a shared link.
  knownColors?: KnownColor[];
  stockOptions?: InventoryStockChoice[];
  inventoryProductId?: string | null;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  async function copySku(sku: string) {
    try {
      await navigator.clipboard.writeText(sku);
      setCopyMessage(`Copied ${sku}`);
    } catch {
      setCopyMessage("Select the SKU text to copy it.");
    }
  }
  const familyRows = familyStockOptions(stockOptions, inventoryProductId);
  const update = (i: number, patch: Partial<VariantDraft>) =>
    onChange(value.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const duplicate = (i: number) => {
    const src = value[i];
    const copy: VariantDraft = { ...src, id: undefined, color: "", colorSlug: "", sku: "",
      cardImages: [...src.cardImages], detailImages: [...src.detailImages],
      sizeStocks: src.sizeStocks.map((s) => ({ size: s.size })) };
    onChange([...value.slice(0, i + 1), copy, ...value.slice(i + 1)]);
  };

  const addSize = (vi: number) =>
    update(vi, { sizeStocks: [...value[vi].sizeStocks, { size: "" }] });
  const setSizeName = (vi: number, si: number, size: string) =>
    update(vi, { sizeStocks: value[vi].sizeStocks.map((s, j) => (j === si ? { size } : s)) });
  const removeSize = (vi: number, si: number) =>
    update(vi, { sizeStocks: value[vi].sizeStocks.filter((_, j) => j !== si) });

  return (
    <div className="space-y-4">
      {copyMessage && <p role="status" className="text-xs text-muted-foreground">{copyMessage}</p>}
      {value.map((v, i) => {
        const offered = new Set(v.sizeStocks.map(cell => cell.size));
        const familySizes = [...new Set(familyRows.filter(row => row.colorSlug === v.colorSlug).map(row => row.size))].sort((a, b) => sizeRank(a) - sizeRank(b));
        return <div key={v.id ?? i} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <strong className="text-sm">Colour {i + 1}{v.color ? ` · ${v.color}` : ""}</strong>
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => move(i, -1)} className="px-1 text-muted-foreground">↑</button>
              <button type="button" onClick={() => move(i, 1)} className="px-1 text-muted-foreground">↓</button>
              <button type="button" onClick={() => duplicate(i)} className="rounded border px-2 py-0.5 text-xs">Duplicate</button>
              <button type="button" onClick={() => remove(i)} className="rounded border border-destructive px-2 py-0.5 text-xs text-destructive">Remove</button>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor={`variant-colour-${i}`} className="text-xs text-muted-foreground">Colour from this family</label>
              <select
                id={`variant-colour-${i}`}
                value={v.colorSlug}
                onChange={(e) => {
                  const known = knownColors.find((k) => k.colorSlug === e.target.value);
                  const sizes = [...new Set(familyRows.filter(row => row.colorSlug === e.target.value).map(row => row.size))].sort((a, b) => sizeRank(a) - sizeRank(b));
                  update(i, { colorSlug: e.target.value, color: known?.color ?? "", sizeStocks: v.id ? v.sizeStocks.map(s => ({ id: s.id, sku: s.sku, size: s.size })) : sizes.map(size => ({ size })) });
                }}
                className="w-full rounded border px-2 py-1 text-sm"
              >
                <option value="">Select a colour…</option>
                {/* Keep the currently-saved color selectable even if it's since been removed from Inventory, so existing data doesn't silently blank out. */}
                {v.colorSlug && !knownColors.some((k) => k.colorSlug === v.colorSlug) && (
                  <option value={v.colorSlug}>{v.color || v.colorSlug} (saved colour)</option>
                )}
                {knownColors.map((k) => <option key={k.colorSlug} value={k.colorSlug}>{k.color}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`variant-swatch-${i}`} className="text-xs text-muted-foreground">Swatch colour</label>
              <input id={`variant-swatch-${i}`} type="color" value={v.swatchHex || "#ffffff"} onChange={(e) => update(i, { swatchHex: e.target.value })} className="h-8 w-full rounded border" />
            </div>
          </div>
          <details className="rounded-md border p-3"><summary className="cursor-pointer text-xs text-muted-foreground">Optional: colour SKU and price overrides</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Colour reference (legacy SKU)</label>
              <input value={v.sku} onChange={(e) => update(i, { sku: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Price override</label>
              <input value={v.price} onChange={(e) => update(i, { price: e.target.value })} placeholder="base price" className="w-full rounded border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Original override</label>
              <input value={v.originalPrice} onChange={(e) => update(i, { originalPrice: e.target.value })} placeholder="optional" className="w-full rounded border px-2 py-1 text-sm" />
            </div>
          </div>
          </details>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Card images (shop slider)</label>
              <GalleryEditor urls={v.cardImages} onChange={(u) => update(i, { cardImages: u })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Detail images (PDP gallery)</label>
              <GalleryEditor urls={v.detailImages} onChange={(u) => update(i, { detailImages: u })} />
            </div>
          </div>
          <button type="button" disabled={v.cardImages.length === 0} onClick={() => update(i, { detailImages: [...v.cardImages] })} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Use shop images for the product gallery</button>

          <div>
            <p className="mb-2 text-xs text-muted-foreground">Choose offered sizes. Each size gets a permanent sale SKU when saved. Removing a size hides it from sale and retains its SKU. Quantities are managed in Inventory.</p>
            {familySizes.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2">
              {familySizes.map(size => <label key={size} className="flex items-center gap-1 rounded border px-2 py-1 text-xs"><input type="checkbox" checked={offered.has(size)}
                onChange={event => update(i, { sizeStocks: event.target.checked ? addOfferedSizes(v.sizeStocks, [size]) : v.sizeStocks.filter(cell => cell.size !== size) })} />{size}</label>)}
              <button type="button" onClick={() => update(i, { sizeStocks: addOfferedSizes(v.sizeStocks, familySizes) })} className="rounded border px-2 py-1 text-xs">Select family sizes</button>
            </div>}
            {v.colorSlug && !familySizes.length && <p className="mb-2 text-xs text-amber-700">No sizes stocked for this colour in the selected family. Existing saved size links are retained below.</p>}
            <div className="space-y-1">
              {v.sizeStocks.map((s, si) => {
                const source = s.plainTshirtStockId === null ? undefined : s.plainTshirtStockId ? stockOptions.find(row => row.id === s.plainTshirtStockId) : familyRows.find(row => row.colorSlug === v.colorSlug && row.size === s.size);
                return <div key={si} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                  <input aria-label={`Offered size ${si + 1} for ${v.color || `colour ${i + 1}`}`} value={s.size} onChange={(e) => setSizeName(i, si, e.target.value)} placeholder="Size / dimensions" className="w-32 rounded border px-2 py-1 text-sm" />
                  <span className="text-xs"><span className="sr-only">Sale SKU: </span><code>{s.sku ?? "Generated when saved"}</code></span>
                  {s.sku && <button type="button" aria-label={`Copy SKU ${s.sku}`} onClick={() => copySku(s.sku!)} className="rounded border px-2 py-1 text-xs">Copy SKU</button>}
                  <span className={`min-w-0 flex-1 text-xs ${source ? "text-muted-foreground" : "text-amber-700"}`}>{source ? `${source.parentName} · ${source.quantity} blanks available` : "Not configured — unavailable for sale"}</span>
                  <button type="button" aria-label={`Remove ${s.size || "size"} from ${v.color || "colour"}`} onClick={() => removeSize(i, si)} className="px-1 text-destructive">✕</button>
                </div>;
              })}
              <button type="button" onClick={() => addSize(i)} className="rounded border px-2 py-1 text-xs">+ Add another size</button>
            </div>
            <details className="mt-3 rounded-md border p-3"><summary className="cursor-pointer text-xs text-muted-foreground">Advanced: shared blank overrides</summary>
              <p className="mt-2 text-xs text-muted-foreground">Use a different source only when it is the same compatible physical blank. Existing explicit links are preserved.</p>
              <div className="mt-2 space-y-2">{v.sizeStocks.map((s, si) => <label key={si} className="flex flex-wrap items-center gap-2 text-xs"><span>{v.color || "Colour"} · {s.size || "Size"}</span>
                  <select aria-label={`Shared blank for ${v.color || "colour"} ${s.size || "size"}`} value={s.plainTshirtStockId === null ? "__none" : s.plainTshirtStockId ?? ""}
                    onChange={event => update(i, { sizeStocks: v.sizeStocks.map((cell, index) => index === si ? { ...cell, plainTshirtStockId: event.target.value === "__none" ? null : event.target.value || undefined } : cell) })}
                    className="min-w-0 flex-1 rounded border px-2 py-1 text-sm">
                    <option value="">Match parent colour/size automatically</option>
                    <option value="__none">Not configured — unavailable for sale</option>
                    {s.plainTshirtStockId && !stockOptions.some(row => row.id === s.plainTshirtStockId) && <option value={s.plainTshirtStockId}>Current shared blank</option>}
                    {stockOptions.filter(row => row.colorSlug === v.colorSlug && row.size === s.size).map(row => <option key={row.id} value={row.id}>{row.parentName} · {row.quantity} available</option>)}
                  </select>
              </label>)}</div>
            </details>
          </div>
        </div>;
      })}
      <button type="button" disabled={!inventoryProductId || knownColors.length === 0} onClick={() => onChange([...value, emptyVariant([])])} className="rounded border px-3 py-1.5 text-sm disabled:opacity-40">+ Add colour variant</button>
    </div>
  );
}

"use client";
import { slugify } from "@/app/_lib/product-helpers";
import { GalleryEditor } from "./gallery-editor";
import { emptyVariant, type VariantDraft } from "./variant-draft";

// Re-export so existing client-side imports (product-form) keep working.
// Server components must import emptyVariant from ./variant-draft directly.
export { emptyVariant };
export type { VariantDraft };

export function VariantEditor({
  value,
  onChange,
  knownColors = [],
}: {
  value: VariantDraft[];
  onChange: (v: VariantDraft[]) => void;
  knownColors?: string[]; // Plain T-Shirt Stock colors — suggested, not enforced.
}) {
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
      sizeStocks: src.sizeStocks.map((s) => ({ ...s })) };
    onChange([...value.slice(0, i + 1), copy, ...value.slice(i + 1)]);
  };

  const addSize = (vi: number) =>
    update(vi, { sizeStocks: [...value[vi].sizeStocks, { size: "" }] });
  const setSizeName = (vi: number, si: number, size: string) =>
    update(vi, { sizeStocks: value[vi].sizeStocks.map((s, j) => (j === si ? { ...s, size } : s)) });
  const removeSize = (vi: number, si: number) =>
    update(vi, { sizeStocks: value[vi].sizeStocks.filter((_, j) => j !== si) });

  return (
    <div className="space-y-4">
      <datalist id="known-plain-tee-colors">
        {knownColors.map((c) => <option key={c} value={c} />)}
      </datalist>
      {value.map((v, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <strong className="text-sm">Color {i + 1}</strong>
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => move(i, -1)} className="px-1 text-muted-foreground">↑</button>
              <button type="button" onClick={() => move(i, 1)} className="px-1 text-muted-foreground">↓</button>
              <button type="button" onClick={() => duplicate(i)} className="rounded border px-2 py-0.5 text-xs">Duplicate</button>
              <button type="button" onClick={() => remove(i)} className="rounded border border-destructive px-2 py-0.5 text-xs text-destructive">Remove</button>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs text-muted-foreground">Color name</label>
              <input list="known-plain-tee-colors" value={v.color} onChange={(e) => update(i, { color: e.target.value, colorSlug: v.colorSlug || slugify(e.target.value) })} className="w-full rounded border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Color slug</label>
              <input value={v.colorSlug} onChange={(e) => update(i, { colorSlug: slugify(e.target.value) })} className="w-full rounded border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Swatch color</label>
              <input type="color" value={v.swatchHex || "#ffffff"} onChange={(e) => update(i, { swatchHex: e.target.value })} className="h-8 w-full rounded border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">SKU (optional)</label>
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

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Sizes offered (quantities are managed in Inventory)</label>
            <div className="space-y-1">
              {v.sizeStocks.map((s, si) => (
                <div key={si} className="flex items-center gap-2">
                  <input value={s.size} onChange={(e) => setSizeName(i, si, e.target.value)} placeholder="Size" className="w-20 rounded border px-2 py-1 text-sm" />
                  <button type="button" onClick={() => removeSize(i, si)} className="px-1 text-destructive">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => addSize(i)} className="rounded border px-2 py-1 text-xs">+ add size</button>
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, emptyVariant()])} className="rounded border px-3 py-1.5 text-sm">+ Add color variant</button>
    </div>
  );
}

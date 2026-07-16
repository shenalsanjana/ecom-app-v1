"use client";
import { useEffect, useState } from "react";
import { searchProductsForOrder, type ProductSearchResult } from "@/app/admin/orders/actions";

export type ProductPickerSelection = { productId: string; variantId: string; size: string | null; quantity: number };

export function ProductPicker({
  onConfirm, confirmLabel, initialQuantity, disabled,
}: {
  onConfirm: (selection: ProductPickerSelection) => void;
  confirmLabel: string;
  initialQuantity?: number;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [product, setProduct] = useState<ProductSearchResult | null>(null);
  const [variantId, setVariantId] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(initialQuantity ?? 1);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const t = setTimeout(() => { searchProductsForOrder(q).then(setResults); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const variant = product?.variants.find((v) => v.id === variantId) ?? null;

  function reset() {
    setQuery(""); setResults([]); setProduct(null); setVariantId(""); setSize(""); setQuantity(initialQuantity ?? 1);
  }

  function confirm() {
    if (!product || !variant) return;
    if (variant.sizes.length > 0 && !size) return;
    onConfirm({ productId: product.id, variantId: variant.id, size: variant.sizes.length > 0 ? size : null, quantity });
    reset();
  }

  if (!product) {
    return (
      <div className="space-y-1">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…"
          className="w-full rounded border px-2 py-1 text-sm" disabled={disabled} />
        {results.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded border text-sm">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" className="block w-full px-2 py-1 text-left hover:bg-secondary" onClick={() => setProduct(p)}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{product.name}</span>
        <button type="button" className="text-xs text-muted-foreground" onClick={reset}>Change</button>
      </div>
      <select value={variantId} onChange={(e) => { setVariantId(e.target.value); setSize(""); }}
        className="w-full rounded border px-2 py-1 text-sm">
        <option value="">Choose color…</option>
        {product.variants.map((v) => <option key={v.id} value={v.id}>{v.color}</option>)}
      </select>
      {variant && variant.sizes.length > 0 && (
        <select value={size} onChange={(e) => setSize(e.target.value)} className="w-full rounded border px-2 py-1 text-sm">
          <option value="">Choose size…</option>
          {variant.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}
        className="w-full rounded border px-2 py-1 text-sm" />
      <button type="button" disabled={disabled || !variant || (variant.sizes.length > 0 && !size)} onClick={confirm}
        className="w-full rounded-md bg-primary px-2 py-1 text-sm text-primary-foreground disabled:opacity-50">
        {confirmLabel}
      </button>
    </div>
  );
}

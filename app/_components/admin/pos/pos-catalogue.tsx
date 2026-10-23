"use client";

import Image from "next/image";
import { isUploadedImage } from "@/app/_lib/uploaded-image";
import { useState } from "react";
import { Package, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatPrice } from "@/app/_lib/format";
import { groupPosProducts, matchesPosSearch, type PosProductGroup } from "@/app/_lib/pos-catalogue";
import type { PosProduct } from "@/app/_lib/pos";

const money = (cents: number) => formatPrice(cents / 100);

export function PosCatalogue({ options, query, locked, onAdd, onClearSearch }: {
  options: PosProduct[]; query: string; locked: boolean;
  onAdd: (option: PosProduct) => void; onClearSearch: () => void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const products = groupPosProducts(options);
  const categories = [...new Map(products.map(product => [product.categoryId, {
    id: product.categoryId, name: product.categoryName,
    count: products.filter(item => item.categoryId === product.categoryId).length,
  }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const visible = products.filter(product => (!category || product.categoryId === category) && matchesPosSearch(product, query));
  const selected = products.find(product => product.id === selectedId);

  return <>
    <nav aria-label="Product categories" className="flex flex-wrap gap-2">
      {[{ id: null, name: "All", count: products.length }, ...categories].map(item => (
        <button key={item.id ?? "all"} type="button" aria-pressed={category === item.id}
          onClick={() => { setCategory(item.id); onClearSearch(); }}
          className={`max-w-full break-words rounded-full border px-3 py-2 text-sm transition ${category === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"}`}>
          {item.name} <span className="ml-1 opacity-70">{item.count}</span>
        </button>
      ))}
    </nav>
    <p className="text-xs text-muted-foreground" aria-live="polite">{visible.length} {visible.length === 1 ? "product" : "products"} · Prices in LKR</p>
    {visible.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {products.length ? "No products match. Try another name or SKU." : "No published products yet. Add products and configure their stock in Inventory."}
    </div> : categories.filter(item => !category || item.id === category).map(item => {
      const entries = visible.filter(product => product.categoryId === item.id);
      if (!entries.length) return null;
      return <section key={item.id} aria-label={item.name} className="space-y-3">
        <h2 className="text-sm font-semibold">{item.name} <span className="ml-1 font-normal text-muted-foreground">{entries.length}</span></h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {entries.map(product => {
            const first = product.options.find(option => option.available > 0) ?? product.options[0];
            const minPrice = Math.min(...product.options.map(option => option.price));
            const variablePrice = product.options.some(option => option.price !== minPrice);
            return <button key={product.id} type="button" disabled={locked || first.available <= 0}
              aria-label={`${product.options.length === 1 ? "Add" : "Choose"} ${product.name}`}
              onClick={() => product.options.length === 1 ? onAdd(first) : setSelectedId(product.id)}
              className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary disabled:opacity-50">
              <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                {first.image ? <Image src={first.image} alt="" fill unoptimized={isUploadedImage(first.image)} sizes="64px" className="object-cover" /> : <Package className="size-6 text-muted-foreground" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-sm font-medium">{product.name}</span>
                <span className="block text-sm">{variablePrice ? "From " : ""}{money(minPrice)}</span>
                <span className="block text-xs text-muted-foreground">{first.available <= 0 ? "Out of stock" : product.options.length === 1 ? "Add to sale" : "Choose colour & size"}</span>
              </span>
              <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>;
          })}
        </div>
      </section>;
    })}
    {selected && <ProductPicker key={selected.id} product={selected} locked={locked}
      onClose={() => setSelectedId(null)} onAdd={option => { onAdd(option); setSelectedId(null); }} />}
  </>;
}

function ProductPicker({ product, locked, onClose, onAdd }: {
  product: PosProductGroup; locked: boolean; onClose: () => void; onAdd: (option: PosProduct) => void;
}) {
  const first = product.options.find(option => option.available > 0) ?? product.options[0];
  const [color, setColor] = useState(first.color);
  const [size, setSize] = useState(product.options.filter(option => option.color === first.color).length === 1 ? first.size : "");
  const colors = [...new Set(product.options.map(option => option.color))];
  const sizes = product.options.filter(option => option.color === color);
  const selected = sizes.find(option => option.size === size);

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
      <DialogTitle className="pr-8 leading-snug">{product.name}</DialogTitle>
      <DialogDescription>Choose the option to add to this sale.</DialogDescription>
      <label className="space-y-2 text-sm"><span className="block font-medium">Colour</span>
        <select value={color} onChange={event => {
          const value = event.target.value;
          setColor(value);
          const options = product.options.filter(option => option.color === value);
          setSize(options.length === 1 ? options[0].size : "");
        }} className="w-full rounded-md border bg-background px-3 py-2.5">
          {colors.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <fieldset><legend className="mb-2 text-sm font-medium">Size</legend>
        <div className="flex flex-wrap gap-2">{sizes.map(option => <button key={option.sizeStockId} type="button"
          disabled={option.available <= 0} aria-pressed={size === option.size} onClick={() => setSize(option.size)}
          className={`min-w-12 rounded-md border px-3 py-2.5 text-sm disabled:opacity-40 ${size === option.size ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
          {option.size}
        </button>)}</div>
      </fieldset>
      <div className="flex min-h-12 items-center justify-between gap-3 border-t pt-3">
        <span className="text-lg font-semibold">{selected ? money(selected.price) : "Choose a size"}</span>
        {selected && <span className="text-xs text-muted-foreground">{selected.available} available</span>}
      </div>
      <button type="button" disabled={locked || !selected || selected.available <= 0} onClick={() => { if (selected) onAdd(selected); }}
        className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add to sale</button>
    </DialogContent>
  </Dialog>;
}

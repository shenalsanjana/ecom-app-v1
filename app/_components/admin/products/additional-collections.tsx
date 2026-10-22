"use client";

import { useState } from "react";
import type { StoreCollection, ShopDepartment } from "./category-select";

export function AdditionalCollections({ categories, departments, primary, value, onChange }: {
  categories: StoreCollection[]; departments: ShopDepartment[]; primary: string;
  value: string[]; onChange: (slugs: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = new Set(value.filter(slug => slug !== primary));
  const term = query.trim().toLowerCase();
  const groups = departments.map(department => ({ ...department,
    collections: categories.filter(collection => collection.departmentSlug === department.slug && collection.slug !== primary &&
      `${collection.name} ${department.name}`.toLowerCase().includes(term)),
  })).filter(department => department.collections.length);

  function toggle(slug: string) {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    onChange([...next]);
  }

  return <fieldset className="space-y-2 rounded-md border p-3">
    <legend className="px-1 text-sm font-medium">Also show in <span className="font-normal text-muted-foreground">(optional)</span></legend>
    <p id="additional-collections-help" className="text-xs text-muted-foreground">Show this same product in more collections or departments. Its primary breadcrumb, URL and shared stock stay the same.</p>
    {selected.size > 0 && <div className="flex flex-wrap gap-2" aria-label="Selected additional collections">
      {categories.filter(collection => selected.has(collection.slug)).map(collection => <button key={collection.slug} type="button"
        onClick={() => toggle(collection.slug)} aria-label={`Remove ${departments.find(department => department.slug === collection.departmentSlug)?.name ?? collection.departmentSlug} → ${collection.name}`}
        className="rounded border bg-secondary px-2 py-1 text-xs">
        {departments.find(department => department.slug === collection.departmentSlug)?.name} → {collection.name} ×
      </button>)}
    </div>}
    <label className="block text-xs">Search collections
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-describedby="additional-collections-help"
        className="mt-1 w-full rounded border px-2 py-1.5 text-sm" placeholder="Collection or department name…" />
    </label>
    <div className="max-h-52 space-y-3 overflow-y-auto p-1">
      {groups.map(department => <fieldset key={department.slug}>
        <legend className="mb-1 text-xs font-semibold">{department.name}</legend>
        {department.collections.map(collection => <label key={collection.slug} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-secondary">
          <input type="checkbox" checked={selected.has(collection.slug)} onChange={() => toggle(collection.slug)} />{collection.name}
        </label>)}
      </fieldset>)}
      {!groups.length && <p className="text-xs text-muted-foreground">{term ? "No matching collections." : "No additional collections available."}</p>}
    </div>
    <p className="text-xs text-muted-foreground" role="status">{selected.size} additional collection{selected.size === 1 ? "" : "s"} selected</p>
  </fieldset>;
}

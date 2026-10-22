"use client";
import { useState, useTransition } from "react";
import { createCategory } from "@/app/admin/categories/actions";
import { ImageInput } from "./image-input";

export type StoreCollection = { slug: string; name: string; departmentSlug: string };
export type ShopDepartment = { slug: string; name: string };

export function CategorySelect({
  categories, departments, value, onChange, onCreated,
}: { categories: StoreCollection[]; departments: ShopDepartment[]; value: string; onChange: (slug: string) => void; onCreated?: (collection: StoreCollection) => void }) {
  const [cats, setCats] = useState(categories);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [departmentSlug, setDepartmentSlug] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function add() {
    if (!name.trim() || !departmentSlug || pending) return;
    setError("");
    start(async () => {
      const r = await createCategory({ name: name.trim(), image: image.trim() || null, departmentSlug });
      if (!r.success) { setError(r.error); return; }
      setCats((c) => [...c, { slug: r.slug!, name: r.name!, departmentSlug }]);
      onCreated?.({ slug: r.slug!, name: r.name!, departmentSlug });
      onChange(r.slug!);
      setAdding(false); setName(""); setImage("");
    });
  }

  return (
    <div>
      <select id="store-collection" className="w-full rounded border px-2 py-1.5 text-sm" value={adding ? "__new__" : value}
        onChange={(e) => { if (e.target.value === "__new__") {
          setDepartmentSlug(cats.find(category => category.slug === value)?.departmentSlug ?? ""); setAdding(true); setError("");
        } else { setAdding(false); onChange(e.target.value); } }}>
        <option value="" disabled>Select a store collection…</option>
        {departments.map(department => <optgroup key={department.slug} label={department.name}>
          {cats.filter(category => category.departmentSlug === department.slug).map(category => <option key={category.slug} value={category.slug}>{category.name}</option>)}
        </optgroup>)}
        <option value="__new__">＋ New store collection…</option>
      </select>
      {adding && (
        <div className="mt-2 space-y-2 rounded border p-2">
          <label className="block text-xs">Collection name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1 text-sm" /></label>
          <label className="block text-xs">Shop department<select value={departmentSlug} onChange={event => setDepartmentSlug(event.target.value)} className="mt-1 block w-full rounded border px-2 py-1 text-sm">
            <option value="">Choose a department…</option>{departments.map(department => <option key={department.slug} value={department.slug}>{department.name}</option>)}
          </select></label>
          <p className="text-xs text-muted-foreground">Image is optional. This collection organises the storefront; its products keep their physical stock sources.</p>
          <ImageInput value={image} onChange={setImage} preview resizeTarget="category" placeholder="Optional image URL / path — or upload →" />
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="button" disabled={pending || !name.trim() || !departmentSlug} onClick={add} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Creating…" : "Create collection"}</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded border px-2 py-1 text-xs">Cancel</button>
            {!name.trim() || !departmentSlug ? (
              <span className="text-xs text-muted-foreground">Name and department are required</span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import { createCategory } from "@/app/admin/products/actions";

type Cat = { slug: string; name: string };

export function CategorySelect({
  categories, value, onChange,
}: { categories: Cat[]; value: string; onChange: (slug: string) => void }) {
  const [cats, setCats] = useState(categories);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [pending, start] = useTransition();

  function add() {
    start(async () => {
      const r = await createCategory({ name, image });
      if (!r.success) { alert(r.error); return; }
      setCats((c) => [...c, { slug: r.slug!, name: r.name! }]);
      onChange(r.slug!);
      setAdding(false); setName(""); setImage("");
    });
  }

  return (
    <div>
      <select className="w-full rounded border px-2 py-1.5 text-sm" value={value}
        onChange={(e) => { if (e.target.value === "__new__") setAdding(true); else onChange(e.target.value); }}>
        <option value="" disabled>Select a category…</option>
        {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        <option value="__new__">＋ New category…</option>
      </select>
      {adding && (
        <div className="mt-2 space-y-2 rounded border p-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" className="w-full rounded border px-2 py-1 text-sm" />
          <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="Image URL / path" className="w-full rounded border px-2 py-1 text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={pending || !name.trim() || !image.trim()} onClick={add} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Create</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded border px-2 py-1 text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

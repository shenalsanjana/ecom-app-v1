"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCategory, updateCategory } from "@/app/admin/categories/actions";
import { ImageInput } from "@/app/_components/admin/products/image-input";

type Department = { slug: string; name: string };
type Initial = { slug?: string; name: string; image: string | null; departmentSlug: string };

export function CategoryForm({
  mode, initial, departments,
}: { mode: "create" | "edit"; initial: Initial; departments: Department[] }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  // Design.image is optional; the text field models "no image" as "".
  const [image, setImage] = useState(initial.image ?? "");
  const [departmentSlug, setDepartmentSlug] = useState(initial.departmentSlug);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function submit() {
    setError("");
    start(async () => {
      // Empty means "no image" — send null so it persists as NULL, not "".
      const payload = { name: name.trim(), image: image.trim() || null, departmentSlug };
      const r =
        mode === "create"
          ? await createCategory(payload)
          : await updateCategory(initial.slug!, payload);
      if (!r.success) { setError(r.error); return; }
      router.push("/admin/categories");
      router.refresh();
    });
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{mode === "create" ? "New store collection" : `Edit collection · ${initial.name}`}</h1>
        <span className="ml-auto flex gap-2">
          <button onClick={() => router.push("/admin/categories")} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
          <button
            disabled={pending || !name.trim() || !departmentSlug}
            onClick={submit}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Save
          </button>
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Choose where shoppers find the products. Collection changes do not change their physical stock sources.</p>
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      <div className="max-w-lg space-y-4">
        <div className="rounded-lg border p-4">
          <label className="text-xs text-muted-foreground">Collection name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
        </div>
        <div className="rounded-lg border p-4">
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="category-department">Shop department</label>
          <select
            id="category-department"
            value={departmentSlug}
            onChange={(e) => setDepartmentSlug(e.target.value)}
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Choose a department…</option>
            {departments.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>
        </div>
        <div className="rounded-lg border p-4">
          <label className="mb-1 block text-xs text-muted-foreground">Image (optional — URL / path or upload)</label>
          <ImageInput value={image} onChange={setImage} preview resizeTarget="category" />
          <p className="mt-2 text-xs text-muted-foreground">
            Leave empty to show the collection&rsquo;s colour tile instead of a photo.
          </p>
        </div>
        {mode === "edit" ? (
          <p className="text-xs text-muted-foreground">
            Renaming this collection updates its URL. The old link will redirect automatically.
          </p>
        ) : null}
      </div>
    </section>
  );
}

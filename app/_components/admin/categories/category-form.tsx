"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCategory, updateCategory } from "@/app/admin/categories/actions";
import { ImageInput } from "@/app/_components/admin/products/image-input";

type Initial = { slug?: string; name: string; image: string };

export function CategoryForm({ mode, initial }: { mode: "create" | "edit"; initial: Initial }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [image, setImage] = useState(initial.image);
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const r =
        mode === "create"
          ? await createCategory({ name: name.trim(), image: image.trim() })
          : await updateCategory(initial.slug!, { name: name.trim(), image: image.trim() });
      if (!r.success) { alert(r.error); return; }
      router.push("/admin/categories");
      router.refresh();
    });
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{mode === "create" ? "New category" : `Edit · ${initial.name}`}</h1>
        <span className="ml-auto flex gap-2">
          <button onClick={() => router.push("/admin/categories")} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
          <button
            disabled={pending || !name.trim() || !image.trim()}
            onClick={submit}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Save
          </button>
        </span>
      </div>
      <div className="max-w-lg space-y-4">
        <div className="rounded-lg border p-4">
          <label className="text-xs text-muted-foreground">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
        </div>
        <div className="rounded-lg border p-4">
          <label className="mb-1 block text-xs text-muted-foreground">Image (URL / path or upload)</label>
          <ImageInput value={image} onChange={setImage} preview />
        </div>
        {mode === "edit" ? (
          <p className="text-xs text-muted-foreground">
            Renaming this category updates its URL. The old link will redirect automatically.
          </p>
        ) : null}
      </div>
    </section>
  );
}

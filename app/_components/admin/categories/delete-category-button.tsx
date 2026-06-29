"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCategory } from "@/app/admin/categories/actions";

export function DeleteCategoryButton({ slug, name }: { slug: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function onClick() {
    if (!confirm(`Delete '${name}'? This cannot be undone.`)) return;
    start(async () => {
      const r = await deleteCategory(slug);
      if (!r.success) { alert(r.error); return; }
      router.refresh();
    });
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="rounded-md border border-destructive px-2 py-1 text-xs text-destructive disabled:opacity-50"
    >
      Delete
    </button>
  );
}

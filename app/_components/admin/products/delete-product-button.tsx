"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProduct } from "@/app/admin/products/actions";

export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function onClick() {
    if (!confirm(`Delete '${name}'? This cannot be undone.`)) return;
    start(async () => {
      const r = await deleteProduct(id);
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

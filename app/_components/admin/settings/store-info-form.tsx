"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStoreInfo } from "@/app/admin/settings/actions";

type StoreInfo = { storeName: string; supportEmail: string; supportPhone: string; businessAddress: string };

const FIELDS: { name: keyof StoreInfo; label: string; type?: string }[] = [
  { name: "storeName", label: "Store name" },
  { name: "supportEmail", label: "Support email", type: "email" },
  { name: "supportPhone", label: "Support phone" },
  { name: "businessAddress", label: "Business address" },
];

export function StoreInfoForm({ initial }: { initial: StoreInfo }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      className="space-y-4"
      action={(formData) =>
        start(async () => {
          const r = await updateStoreInfo(formData);
          setMsg(r.success ? "Saved" : r.error);
          if (r.success) router.refresh();
        })
      }
    >
      {FIELDS.map((f) => (
        <div key={f.name} className="grid gap-1.5">
          <label htmlFor={f.name} className="text-sm font-medium">{f.label}</label>
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            defaultValue={initial[f.name]}
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {pending ? "Saving…" : "Save store info"}
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}

"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDeliveryPricing } from "@/app/admin/settings/actions";

type Pricing = { colomboDeliveryCost: number; otherDeliveryCost: number; freeDeliveryThreshold: number };

const FIELDS: { name: keyof Pricing; label: string }[] = [
  { name: "colomboDeliveryCost", label: "Colombo delivery (Rs.)" },
  { name: "otherDeliveryCost", label: "Other zone delivery (Rs.)" },
  { name: "freeDeliveryThreshold", label: "Free delivery over (Rs.)" },
];

export function DeliveryPricingForm({ initial }: { initial: Pricing }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      className="space-y-4"
      action={(formData) =>
        start(async () => {
          const r = await updateDeliveryPricing(formData);
          setMsg(r.success ? "Saved" : r.error);
          if (r.success) router.refresh();
        })
      }
    >
      <p className="text-sm text-muted-foreground">
        Price changes apply to new orders only — existing orders keep the delivery cost recorded at checkout.
      </p>
      {FIELDS.map((f) => (
        <div key={f.name} className="grid gap-1.5">
          <label htmlFor={f.name} className="text-sm font-medium">{f.label}</label>
          <input
            id={f.name}
            name={f.name}
            type="number"
            min={0}
            step={1}
            defaultValue={initial[f.name]}
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {pending ? "Saving…" : "Save delivery pricing"}
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}
